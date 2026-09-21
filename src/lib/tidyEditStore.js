/**
 * 정리안 검토 편집의 주인.
 *
 * 왜 React 컴포넌트 밖에 있는가: ProjectWorkspace는 구역을 바꿀 때 패널을 unmount한다.
 * 편집 상태와 저장 타이머가 패널 안에 있으면, 제목을 고치고 0.7초 안에 다른 구역으로 가는
 * 아주 평범한 동작에서 고친 것이 사라진다 — 타이머는 cleanup에서 취소되고 상태는 함께
 * 사라지기 때문이다. 사용자가 한 일이 화면 전환 타이밍에 따라 없어지면 안 된다.
 * 그래서 저장을 책임지는 쪽을 패널보다 오래 살게 두고, 패널은 그것을 <보기만> 한다.
 *
 * 이 모듈이 지키는 것:
 *
 *  1. <네 가지를 구분한다.> 서버가 확인한 편집(confirmed), 사용자가 지금 보는 편집(local),
 *     전송 중인 스냅샷(sending), 아직 보내지 않은 것(dirty). 하나로 뭉치면 "저장됨"이
 *     거짓말이 된다.
 *  2. <정리안마다 저장은 한 줄로 흐른다.> 전송 중에 새로 고치면 다음 전송으로 모으고,
 *     먼저 보낸 응답이 늦게 와도 더 최근 입력을 되돌리지 않는다.
 *  3. <생명주기가 끝난 응답은 아무것도 바꾸지 못한다.> 버리기·적용·판 교체는 세대를 올린다.
 *     그 전에 떠난 GET·PUT의 응답은 도착해도 버려진다.
 *  4. <저장 상태는 실제 큐와 일치한다.> status는 따로 쓰는 값이 아니라 (dirty, sending,
 *     error, conflict)에서 계산한다. 요청 하나가 끝났다고 아직 남은 변경이 있는데
 *     "저장됨"이 되지 않는다.
 *  5. <새로고침에도 남는다.> 아직 서버에 닿지 않은 편집은 사용자·프로젝트·정리안·기준
 *     리비전과 함께 localStorage에 남긴다. unmount 요청이나 beforeunload는 도착을
 *     보장하지 않으므로 그것에 기대지 않는다. 단 서버가 "그 정리안은 없다"고 하면
 *     복구 데이터는 <버린다> — 버린 안이 로컬 저장소를 통해 되살아나면 안 된다.
 *  6. <409는 잃는 사건이 아니다.> 서버 최신본과 내 편집을 3-way로 합치고, 같은 변경에
 *     서로 다른 값이 있을 때만 사용자에게 고르게 한다.
 */

import { projectTidyAPI } from '../api/api.js';

/** 편집을 서버에 밀어 넣기 전에 기다리는 시간. 타자를 칠 때마다 보내지 않는다. */
export const AUTOSAVE_MS = 700;

/** 409를 만났을 때 합치고 다시 보내는 횟수의 상한. 무한 왕복을 만들지 않는다. */
const MAX_CONFLICT_ROUNDS = 3;

const STORAGE_KEY = 'tidyEdits:v1';

/** courseId별 항목. 키를 프로젝트로 두는 이유는 프로젝트당 열린 정리안이 하나이기 때문이다. */
const entries = new Map();

// ===== 사용자 구분 =====

/**
 * 복구 데이터를 사용자별로 가른다.
 *
 * JWT의 sub(=userId)를 쓴다. 같은 브라우저를 다른 계정으로 쓰면 남의 편집이 내 화면에
 * 복구되면 안 되고, 로그아웃 뒤 남은 조각이 다음 사람에게 보이면 더 안 된다.
 * 서명을 검증하는 것이 아니라 <이름표>로만 쓴다 — 실제 권한은 서버가 토큰으로 판단한다.
 */
function currentUserKey() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = JSON.parse(json)?.sub;
    return sub == null ? null : String(sub);
  } catch {
    return null;
  }
}

// ===== 복구 저장소 =====

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(next) {
  try {
    if (!next || Object.keys(next).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 사생활 보호 모드·용량 초과. 복구는 편의 기능이라 여기서 실패해도 편집 자체는 계속 간다.
  }
}

function storageKeyFor(courseId) {
  const user = currentUserKey();
  return user == null ? null : `${user}:${courseId}`;
}

function rememberDraft(entry) {
  const key = storageKeyFor(entry.courseId);
  if (key == null) return;
  const store = readStore();
  store[key] = {
    proposalId: entry.proposalId,
    editRevision: entry.editRevision,
    edits: entry.local,
    savedAt: Date.now(),
  };
  writeStore(store);
}

function forgetDraft(courseId) {
  const key = storageKeyFor(courseId);
  if (key == null) return;
  const store = readStore();
  if (!(key in store)) return;
  delete store[key];
  writeStore(store);
}

function recallDraft(courseId) {
  const key = storageKeyFor(courseId);
  if (key == null) return null;
  return readStore()[key] ?? null;
}

// ===== 항목 =====

function blank(courseId) {
  return {
    courseId,
    proposalId: null,
    generation: 0,
    confirmed: {},
    local: {},
    editRevision: 0,
    sending: null,
    dirty: false,
    everSaved: false,
    errorText: null,
    conflicts: [],
    timer: null,
    listeners: new Set(),
    snapshot: null,
  };
}

function entryFor(courseId) {
  let entry = entries.get(courseId);
  if (!entry) {
    entry = blank(courseId);
    entries.set(courseId, entry);
  }
  return entry;
}

function statusOf(entry) {
  if (entry.conflicts.length > 0) return 'conflict';
  if (entry.errorText) return 'error';
  if (entry.sending) return 'saving';
  if (entry.dirty) return 'pending';
  return entry.everSaved ? 'saved' : null;
}

function publish(entry) {
  entry.snapshot = {
    proposalId: entry.proposalId,
    edits: entry.local,
    editRevision: entry.editRevision,
    status: statusOf(entry),
    errorText: entry.errorText,
    conflicts: entry.conflicts,
    dirty: entry.dirty || !!entry.sending,
  };
  entry.listeners.forEach((fn) => fn());
}

// ===== 비교 =====

function normalize(edits) {
  const out = {};
  Object.entries(edits ?? {}).forEach(([changeId, value]) => {
    if (!value) return;
    /*
      빈 문자열을 null로 바꾸지 않는다. 제목 칸은 `edit.title ?? change.title`로 그리므로,
      여기서 ''을 null로 접으면 사용자가 칸을 비우는 순간 원래 제목이 도로 나타나 지울 수가
      없다. 서버는 저장할 때 trim해서 null로 만들고, 그 결과는 다음 조회에서 자연스럽게
      반영된다 — 비교할 때만 ''과 null을 같게 본다(sameEdit).
    */
    const title = value.title == null ? null : value.title;
    // needsConfirm은 서버가 정한다. 값으로 비교할 때도 서버 값을 그대로 들고 다닌다.
    out[changeId] = {
      excluded: value.excluded === true,
      title,
      ...(value.needsConfirm ? { needsConfirm: true } : {}),
      ...(value.confirmedAtRevision != null ? { confirmedAtRevision: value.confirmedAtRevision } : {}),
    };
  });
  return out;
}

function sameEdit(a, b) {
  const x = a ?? { excluded: false, title: null };
  const y = b ?? { excluded: false, title: null };
  return (x.excluded === true) === (y.excluded === true)
    && (x.title ?? '') === (y.title ?? '');
}

function sameEdits(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  const keys = new Set([...Object.keys(na), ...Object.keys(nb)]);
  for (const key of keys) if (!sameEdit(na[key], nb[key])) return false;
  return true;
}

/**
 * 3-way 합치기. base는 내가 마지막으로 "서버도 이걸 안다"고 믿은 값이다.
 *
 * 내 쪽만 바뀌었으면 내 것을, 서버 쪽만 바뀌었으면 서버 것을 쓴다. 둘 다 base와 다르고
 * 서로도 다르면 그것만 충돌이다 — 그때도 내 값을 화면에 유지한 채 상대 값을 함께 보여주고
 * 고르게 한다. 통째로 서버 값을 덮어쓰면 방금 친 제목이 소리 없이 사라진다.
 */
function merge(base, mine, theirs) {
  const b = normalize(base);
  const m = normalize(mine);
  const t = normalize(theirs);
  const keys = new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)]);
  const merged = {};
  const conflicts = [];
  keys.forEach((key) => {
    const mineChanged = !sameEdit(b[key], m[key]);
    const theirsChanged = !sameEdit(b[key], t[key]);
    if (mineChanged && theirsChanged && !sameEdit(m[key], t[key])) {
      merged[key] = m[key] ?? t[key];
      conflicts.push({ changeId: key, mine: m[key] ?? null, theirs: t[key] ?? null });
      return;
    }
    const winner = mineChanged ? m[key] : t[key];
    if (winner) merged[key] = winner;
  });
  return { merged, conflicts };
}

// ===== 서버 상태 받아들이기 =====

/**
 * GET 응답을 받아들인다. <미저장 편집을 덮지 않는다.>
 *
 * 자료 분석이 끝나 refreshToken이 바뀌거나 생성 중 폴링이 도는 동안에도 이 함수가 불린다.
 * 그때마다 서버 값으로 local을 갈아치우면 타이핑 중인 제목이 사라진다.
 */
export function adopt(courseId, view) {
  const entry = entryFor(courseId);
  const proposalId = view?.proposalId ?? null;
  const open = proposalId != null && view?.status === 'PROPOSED';

  if (!open) {
    // 서버에 검토할 안이 없다. 버려졌거나 적용됐거나 아직 없다 — 어느 쪽이든 로컬 초안은
    // 근거를 잃는다. 여기서 지우지 않으면 "버린 안"이 새로고침으로 되살아난다.
    if (entry.proposalId != null || entry.dirty) reset(entry);
    forgetDraft(courseId);
    publish(entry);
    return entry.snapshot;
  }

  const serverEdits = normalize(view?.edits);
  const serverRevision = view?.editRevision ?? 0;

  if (entry.proposalId !== proposalId) {
    // 다른 정리안이다(첫 조회이거나 새 판으로 교체됐다). 이전 편집은 이 안의 것이 아니다.
    reset(entry);
    entry.proposalId = proposalId;
    entry.confirmed = serverEdits;
    entry.local = serverEdits;
    entry.editRevision = serverRevision;

    const draft = recallDraft(courseId);
    if (draft && draft.proposalId === proposalId && !sameEdits(draft.edits, serverEdits)) {
      // 새로고침 전에 저장되지 못한 편집이다. 서버 값 위에 얹고 곧바로 저장을 건다.
      const { merged, conflicts } = merge(serverEdits, draft.edits, serverEdits);
      entry.local = normalize(merged);
      entry.conflicts = conflicts;
      entry.dirty = true;
      schedule(entry, 0);
    } else if (draft) {
      forgetDraft(courseId);
    }
    publish(entry);
    return entry.snapshot;
  }

  // 같은 정리안. 서버가 확인한 값만 갱신하고, 내 미저장 편집은 그대로 둔다.
  if (!entry.sending && !entry.dirty) {
    entry.local = serverEdits;
    entry.confirmed = serverEdits;
    entry.editRevision = serverRevision;
  } else if (serverRevision > entry.editRevision && !entry.sending) {
    // 다른 탭이 저장했다. 내 것을 지키면서 합친다.
    const { merged, conflicts } = merge(entry.confirmed, entry.local, serverEdits);
    entry.local = normalize(merged);
    entry.confirmed = serverEdits;
    entry.editRevision = serverRevision;
    entry.conflicts = conflicts;
    if (!sameEdits(entry.local, serverEdits)) {
      entry.dirty = true;
      schedule(entry, 0);
    }
  }
  publish(entry);
  return entry.snapshot;
}

function reset(entry) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  entry.generation += 1;
  entry.proposalId = null;
  entry.confirmed = {};
  entry.local = {};
  entry.editRevision = 0;
  entry.sending = null;
  entry.dirty = false;
  entry.everSaved = false;
  entry.errorText = null;
  entry.conflicts = [];
}

// ===== 사용자 편집 =====

/** 사용자가 고쳤다. 화면은 즉시 바뀌고 저장은 잠시 뒤에 간다. */
export function update(courseId, nextEdits) {
  const entry = entryFor(courseId);
  if (entry.proposalId == null) return entry.snapshot;
  entry.local = normalize(nextEdits);
  entry.dirty = !sameEdits(entry.local, entry.confirmed);
  entry.errorText = null;
  if (entry.dirty) rememberDraft(entry); else forgetDraft(courseId);
  schedule(entry, AUTOSAVE_MS);
  publish(entry);
  return entry.snapshot;
}

/** 충돌한 변경 하나를 사용자가 정한다. */
export function resolveConflict(courseId, changeId, pick) {
  const entry = entryFor(courseId);
  const conflict = entry.conflicts.find((c) => c.changeId === changeId);
  if (!conflict) return entry.snapshot;
  const next = { ...entry.local };
  const chosen = pick === 'theirs' ? conflict.theirs : conflict.mine;
  if (chosen) next[changeId] = chosen; else delete next[changeId];
  entry.conflicts = entry.conflicts.filter((c) => c.changeId !== changeId);
  entry.local = normalize(next);
  entry.dirty = !sameEdits(entry.local, entry.confirmed);
  if (entry.dirty) rememberDraft(entry); else forgetDraft(courseId);
  schedule(entry, entry.dirty ? 0 : null);
  publish(entry);
  return entry.snapshot;
}

function schedule(entry, delay) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  if (delay == null || !entry.dirty) return;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void send(entry);
  }, delay);
}

/**
 * 지금 당장 보낸다. 화면을 떠나기 직전(패널 unmount, [나중에])에 부른다.
 *
 * 떠난 뒤에도 이 모듈은 살아 있으므로 응답을 기다릴 필요가 없다 — 기다리게 하면 화면 전환이
 * 네트워크 속도만큼 늦어진다. 결과는 다시 들어왔을 때 status로 보인다.
 */
export function flush(courseId) {
  const entry = entries.get(courseId);
  if (!entry || !entry.dirty) return Promise.resolve(entry?.snapshot ?? null);
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  return send(entry);
}

async function send(entry, round = 0) {
  if (entry.sending || !entry.dirty || entry.proposalId == null) return entry.snapshot;

  const generation = entry.generation;
  const proposalId = entry.proposalId;
  const snapshot = entry.local;
  entry.sending = snapshot;
  publish(entry);

  try {
    const saved = await projectTidyAPI.saveEdits(proposalId, {
      editRevision: entry.editRevision,
      edits: snapshot,
    });
    // 떠난 사이에 버려졌거나 다른 안으로 갈아탔으면 이 응답은 아무것도 바꾸지 못한다.
    if (entry.generation !== generation || entry.proposalId !== proposalId) return entry.snapshot;

    entry.sending = null;
    entry.confirmed = normalize(saved?.edits ?? snapshot);
    entry.editRevision = saved?.editRevision ?? entry.editRevision;
    entry.everSaved = true;
    entry.errorText = null;

    if (sameEdits(entry.local, snapshot)) {
      // 보내는 동안 새 입력이 없었다. 서버가 정리한 값을 그대로 받는다.
      entry.local = entry.confirmed;
      entry.dirty = false;
      forgetDraft(entry.courseId);
    } else {
      // 보내는 동안 사용자가 더 고쳤다. 더 최근 값이 이긴다 — 되돌리지 않는다.
      entry.dirty = !sameEdits(entry.local, entry.confirmed);
      if (entry.dirty) rememberDraft(entry);
    }
    publish(entry);
    if (entry.dirty) schedule(entry, 0);
    return entry.snapshot;
  } catch (err) {
    if (entry.generation !== generation || entry.proposalId !== proposalId) return entry.snapshot;
    entry.sending = null;

    if (err?.code === 'E409_029' && round < MAX_CONFLICT_ROUNDS) {
      return reconcile(entry, generation, proposalId, round);
    }
    // 편집은 그대로 둔다. 복구 저장소에도 남긴다 — 실패를 삼키고 "저장됨"으로 만들지 않는다.
    entry.errorText = err?.message || '고친 내용을 저장하지 못했어요.';
    rememberDraft(entry);
    publish(entry);
    return entry.snapshot;
  }
}

/** 409. 서버 최신본을 읽어 합친 뒤 다시 보낸다. 내 편집을 버리지 않는다. */
async function reconcile(entry, generation, proposalId, round) {
  try {
    const latest = await projectTidyAPI.get(entry.courseId);
    if (entry.generation !== generation || entry.proposalId !== proposalId) return entry.snapshot;
    if (latest?.proposalId !== proposalId || latest?.status !== 'PROPOSED') {
      // 그 사이 적용되거나 버려졌다. 여기서 되살리지 않는다.
      return adopt(entry.courseId, latest);
    }
    const serverEdits = normalize(latest?.edits);
    const { merged, conflicts } = merge(entry.confirmed, entry.local, serverEdits);
    entry.confirmed = serverEdits;
    entry.editRevision = latest?.editRevision ?? entry.editRevision;
    entry.local = normalize(merged);
    entry.conflicts = conflicts;
    entry.dirty = !sameEdits(entry.local, entry.confirmed);
    entry.errorText = null;
    if (entry.dirty) rememberDraft(entry); else forgetDraft(entry.courseId);
    publish(entry);
    /*
      충돌이 남아 있으면 다시 보내지 않는다. 내 값을 그대로 밀어붙이면 상대의 값을 덮어쓰게
      되고, 서버가 또 거절하면 같은 왕복만 반복한다. 사용자가 고른 뒤에 보낸다
      (resolveConflict가 다시 걸어 준다).
    */
    if (entry.dirty && entry.conflicts.length === 0) return send(entry, round + 1);
    return entry.snapshot;
  } catch (err) {
    if (entry.generation !== generation || entry.proposalId !== proposalId) return entry.snapshot;
    entry.errorText = err?.message || '다른 곳에서 먼저 고쳤어요. 잠시 뒤 다시 저장할게요.';
    rememberDraft(entry);
    publish(entry);
    return entry.snapshot;
  }
}

// ===== 생명주기 =====

/**
 * 적용·폐기가 서버에서 확정된 뒤 부른다. 세대를 올려 이전 응답을 전부 무효로 만들고
 * 복구 데이터를 지운다. 낙관적으로 미리 부르지 않는다 — 실패하면 편집을 잃는다.
 */
export function clear(courseId) {
  const entry = entries.get(courseId);
  if (!entry) {
    forgetDraft(courseId);
    return;
  }
  reset(entry);
  forgetDraft(courseId);
  publish(entry);
}

/** 아직 서버에 닿지 않은 편집이 있는가. 적용 버튼을 막는 근거다. */
export function hasUnsaved(courseId) {
  const entry = entries.get(courseId);
  return !!entry && (entry.dirty || !!entry.sending);
}

/** 지금 유효한 세대. 화면이 오래된 응답을 가려낼 때 쓴다. */
export function generationOf(courseId) {
  return entries.get(courseId)?.generation ?? 0;
}

export function subscribe(courseId, listener) {
  const entry = entryFor(courseId);
  entry.listeners.add(listener);
  return () => { entry.listeners.delete(listener); };
}

export function getSnapshot(courseId) {
  const entry = entryFor(courseId);
  if (!entry.snapshot) publish(entry);
  return entry.snapshot;
}

/**
 * 테스트 전용. 모듈 수준 상태를 비운다.
 *
 * keepStorage=true면 localStorage는 남긴다 — 새로고침(모듈 상태는 사라지고 저장소는 남는
 * 상황)을 그대로 흉내 내려면 그 구분이 필요하다.
 */
export function __resetAll({ keepStorage = false } = {}) {
  entries.forEach((entry) => { if (entry.timer) clearTimeout(entry.timer); });
  entries.clear();
  if (!keepStorage) {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ }
  }
}
