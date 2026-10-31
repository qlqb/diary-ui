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
 *  3. <생명주기가 끝난 응답은 아무것도 바꾸지 못한다.> 버리기·적용·판 교체·계정 전환은
 *     세대를 올린다. 그 전에 떠난 GET·PUT의 응답은 도착해도 버려진다.
 *  4. <저장 상태는 실제 큐와 일치한다.> status는 따로 쓰는 값이 아니라 (dirty, sending,
 *     error, conflict)에서 계산한다. 요청 하나가 끝났다고 아직 남은 변경이 있는데
 *     "저장됨"이 되지 않는다.
 *  5. <새로고침에도 남는다 — 그러나 남의 편집을 덮지 않는다.> 아직 서버에 닿지 않은 편집은
 *     <그 편집의 기준(base)과 기준 리비전>까지 함께 localStorage에 남긴다. 복구할 때는
 *     `기준 / 복구할 내 편집 / 지금 서버`로 3-way 병합한다. 기준 없이 "지금 서버"를 기준으로
 *     삼으면 그 사이 다른 탭이 바꾼 항목까지 내 변경으로 오인해 조용히 되돌린다
 *     (2026-09-22 검토에서 재현). 기준이 없는 옛 형식(v1)은 추측해서 보내지 않고, 다른
 *     항목마다 고르게 한다. 서버가 "그 정리안은 없다"고 하면 복구 데이터는 <버린다>.
 *  6. <409는 잃는 사건이 아니다.> 서버 최신본과 내 편집을 3-way로 합치고, 같은 변경에
 *     서로 다른 값이 있을 때만 사용자에게 고르게 한다.
 *  7. <미해결 충돌이 하나라도 있으면 아무것도 보내지 않는다.> 검사는 버튼이 아니라 실제
 *     전송 직전의 한 곳(send)에 있다 — 예약 타이머·flush·재조정·재시도·충돌 해결 어느
 *     경로로 들어와도 같은 문을 지난다. 서버는 편집 <전체>를 한 번에 받으므로, 충돌 하나를
 *     풀었다고 나머지 충돌 값까지 실어 보내면 그 항목의 상대 값을 덮는다.
 *  8. <"보냈다"와 "저장됐다"를 구분한다.> flush는 화면을 떠날 때 쓰는 "지금 보내 둬"이고
 *     결과를 기다릴 필요가 없다. 다른 작업(다시 정리)이 저장된 편집에 기대야 하면
 *     ensureSaved를 쓴다 — 전송 중인 요청과 그 뒤에 쌓인 편집이 모두 서버에 확인될 때까지
 *     기다리고, 확인되지 못하면 이유와 함께 실패를 돌려준다.
 */

import { projectTidyAPI } from '../api/api.js';

/** 편집을 서버에 밀어 넣기 전에 기다리는 시간. 타자를 칠 때마다 보내지 않는다. */
export const AUTOSAVE_MS = 700;

/** 409를 만났을 때 합치고 다시 보내는 횟수의 상한. 무한 왕복을 만들지 않는다. */
const MAX_CONFLICT_ROUNDS = 3;

/** ensureSaved가 "보내고 확인받기"를 되풀이하는 상한. 입력이 계속 들어와도 끝이 있다. */
const MAX_ENSURE_ROUNDS = 5;

/** ensureSaved의 전체 대기 한도. 응답이 오지 않는 요청 하나에 다음 작업이 영원히 묶이지 않게. */
export const ENSURE_TIMEOUT_MS = 20000;

/** 복구 기록. v2부터 기준(base)과 기준 리비전을 함께 남긴다. */
const STORAGE_KEY = 'tidyEdits:v2';
/** 기준이 없던 옛 기록. 읽기만 하고, 자동으로 보내지 않는다. */
const LEGACY_STORAGE_KEY = 'tidyEdits:v1';

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

/**
 * 이 항목을 만든 사용자가 지금도 로그인해 있는가.
 *
 * 로그아웃하고 다른 계정으로 들어온 뒤에도 앞 사람의 예약 타이머나 늦은 응답은 살아 있다.
 * 그것이 새 사람의 토큰으로 보내지거나 새 사람 이름으로 복구 저장소에 남으면 안 된다.
 */
function sameUser(entry) {
  return entry.userKey === currentUserKey();
}

// ===== 복구 저장소 =====

function readStore(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(key, next) {
  try {
    if (!next || Object.keys(next).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // 사생활 보호 모드·용량 초과. 복구는 편의 기능이라 여기서 실패해도 편집 자체는 계속 간다.
  }
}

const draftKey = (userKey, courseId) => `${userKey}:${courseId}`;

/**
 * 미저장 편집을 남긴다. 기준(confirmed)과 기준 리비전을 함께 남기는 것이 핵심이다.
 *
 * 전송 중에도 confirmed는 "보내기 전 서버가 안다고 확인한 값"이라 base로 쓸 수 있다.
 * 충돌도 함께 남긴다 — 새로고침 뒤 기준이 서버 최신으로 옮겨 가면 병합만으로는 그 충돌이
 * 다시 드러나지 않는다.
 */
function rememberDraft(entry) {
  // 이름표가 없으면(토큰 없음) 남기지 않는다 — 누구의 기록인지 모르는 조각을 만들지 않는다.
  if (entry.userKey == null || !sameUser(entry) || entry.proposalId == null) return;
  const store = readStore(STORAGE_KEY);
  store[draftKey(entry.userKey, entry.courseId)] = {
    v: 2,
    proposalId: entry.proposalId,
    revision: entry.revision,
    baseEditRevision: entry.editRevision,
    base: entry.confirmed,
    edits: entry.local,
    resolutions: entry.resolutions,
    conflicts: entry.conflicts,
    savedAt: Date.now(),
  };
  writeStore(STORAGE_KEY, store);
}

function forgetDraft(userKey, courseId) {
  if (userKey == null) return;
  const key = draftKey(userKey, courseId);
  [STORAGE_KEY, LEGACY_STORAGE_KEY].forEach((storageKey) => {
    const store = readStore(storageKey);
    if (!(key in store)) return;
    delete store[key];
    writeStore(storageKey, store);
  });
}

function recallDraft(userKey, courseId) {
  if (userKey == null) return null;
  const key = draftKey(userKey, courseId);
  const current = readStore(STORAGE_KEY)[key];
  if (current) return current;
  const legacy = readStore(LEGACY_STORAGE_KEY)[key];
  return legacy ? { ...legacy, legacy: true } : null;
}

/** 기록을 남기거나 지운다. 남길 것은 "보낼 것" 또는 "고를 것"이 있을 때다. */
function persist(entry) {
  if (entry.dirty || entry.conflicts.length > 0) rememberDraft(entry);
  else if (sameUser(entry)) forgetDraft(entry.userKey, entry.courseId);
}

// ===== 항목 =====

function blank(courseId) {
  return {
    courseId,
    userKey: null,
    proposalId: null,
    revision: null,
    generation: 0,
    /** changeId → 'KEEP' | 'DROP'. 아직 서버에 보내지 않은 승계 확인. */
    resolutions: {},
    confirmed: {},
    local: {},
    editRevision: 0,
    sending: null,
    /** 지금 날아가는 전송의 약속. ensureSaved가 그 결과를 기다린다. */
    sendPromise: null,
    /** 전송 중에 도착한 더 새 서버 조회. 응답이 온 뒤에 합친다(아래 send). */
    pendingView: null,
    dirty: false,
    everSaved: false,
    errorText: null,
    conflicts: [],
    /** 새로고침 전 편집을 되살렸다는 표시. legacy면 옛 형식이라 사용자가 골라야 한다. */
    recovered: null,
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

function hasResolutions(entry) {
  return Object.keys(entry.resolutions).length > 0;
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
    recovered: entry.recovered,
    dirty: entry.dirty || !!entry.sending,
    /*
      확인을 기다리는 승계 편집. 하나라도 있으면 적용을 막는다 — 확인하지 않은 "제외"는
      새 판의 작업을 조용히 가리고, 가려진 것은 화면에 나타나지 않으므로 사용자가
      알아챌 방법이 없다. 서버도 같은 것을 막지만(E409_034), 거기까지 가서 거절당하는
      것보다 누르기 전에 무엇을 확인해야 하는지 보이는 편이 낫다.
    */
    unconfirmed: Object.entries(entry.local)
      .filter(([, value]) => value?.needsConfirm)
      .map(([changeId]) => changeId),
  };
  entry.listeners.forEach((fn) => fn());
}

/** 저장 경로가 돌려주는 결과. 호출자가 "저장됨"과 "막힘"을 구별할 수 있어야 한다. */
function outcome(entry, ok, reason = null) {
  return {
    ok,
    reason,
    proposalId: entry.proposalId,
    editRevision: entry.editRevision,
    snapshot: entry.snapshot,
  };
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
      // 확인 화면이 "전에는 무엇이었고 무엇이 달라졌나"를 보여 주려면 이 값이 살아 있어야 한다.
      ...(value.needsConfirm && value.carriedFrom ? { carriedFrom: value.carriedFrom } : {}),
    };
  });
  return out;
}

/**
 * 두 편집이 서버에 같은 결과를 남기는가.
 *
 * 서버는 제목을 trim하고 빈 제목을 null로 저장한다. 그 정규화를 비교에도 그대로 쓴다 —
 * 그러지 않으면 서버가 돌려준 "x"와 내가 친 "x "가 영원히 다른 값이 되어 저장이 되풀이된다.
 */
function sameEdit(a, b) {
  const x = a ?? { excluded: false, title: null };
  const y = b ?? { excluded: false, title: null };
  return (x.excluded === true) === (y.excluded === true)
    && String(x.title ?? '').trim() === String(y.title ?? '').trim();
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
 * "없음"도 값이다: 지운 편집·푼 제외·비운 제목은 base와 다르면 변경으로 센다.
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
      if (m[key]) merged[key] = m[key];
      conflicts.push({ changeId: key, mine: m[key] ?? null, theirs: t[key] ?? null });
      return;
    }
    const winner = mineChanged ? m[key] : t[key];
    if (winner) merged[key] = winner;
  });
  return { merged, conflicts };
}

/**
 * 확인 표시(needsConfirm·carriedFrom)는 서버가 권위다.
 *
 * 복구한 편집이나 내 로컬 값에 남은 표시를 그대로 믿으면, 다른 탭이 이미 확인한 항목이
 * 다시 "확인 필요"로 보이거나 반대로 서버가 아직 막는 항목이 풀린 것처럼 보인다.
 * 아직 보내지 않은 내 확인(resolutions)만 예외로 화면에 반영한다.
 */
function withServerAuthority(edits, serverEdits, resolutions) {
  const out = {};
  Object.entries(edits).forEach(([changeId, value]) => {
    const { needsConfirm: _n, carriedFrom: _c, ...rest } = value;
    const server = serverEdits[changeId];
    if (server?.needsConfirm && resolutions[changeId] !== 'KEEP') {
      out[changeId] = { ...rest, needsConfirm: true, ...(server.carriedFrom ? { carriedFrom: server.carriedFrom } : {}) };
    } else {
      out[changeId] = rest;
    }
  });
  return out;
}

/** 보낼 수 없는 확인은 버린다. 서버가 더는 확인을 기다리지 않는 항목이면 의미가 없다. */
function liveResolutions(resolutions, serverEdits) {
  const out = {};
  Object.entries(resolutions ?? {}).forEach(([changeId, decision]) => {
    if (serverEdits[changeId]?.needsConfirm) out[changeId] = decision;
  });
  return out;
}

/**
 * 서버의 더 새 편집을 받아들인다. 내 미저장 편집은 지키고, 충돌은 쌓아 둔다.
 *
 * 이미 있던 충돌은 병합이 새로 찾지 못해도(기준이 옮겨 가서) 내 값이 여전히 서버와 다르면
 * 남긴다 — 상대 값만 최신으로 바꾼다. 서버가 내 값과 같아졌으면 저절로 풀린다.
 */
function absorb(entry, serverEdits, serverRevision) {
  const { merged, conflicts } = merge(entry.confirmed, entry.local, serverEdits);
  const found = new Set(conflicts.map((c) => c.changeId));
  const kept = entry.conflicts
    .filter((c) => !found.has(c.changeId) && !sameEdit(c.mine, serverEdits[c.changeId]))
    .map((c) => ({ ...c, theirs: serverEdits[c.changeId] ?? null }));
  entry.resolutions = liveResolutions(entry.resolutions, serverEdits);
  entry.local = withServerAuthority(normalize(merged), serverEdits, entry.resolutions);
  entry.confirmed = serverEdits;
  entry.editRevision = serverRevision;
  entry.conflicts = [...conflicts, ...kept];
  entry.dirty = !sameEdits(entry.local, entry.confirmed) || hasResolutions(entry);
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
  const user = currentUserKey();
  if (entry.userKey !== user) {
    // 다른 계정의 화면이다. 앞 사람의 편집·타이머·응답은 여기서 끊는다.
    reset(entry);
    entry.userKey = user;
  }
  const proposalId = view?.proposalId ?? null;
  const open = proposalId != null && view?.status === 'PROPOSED';

  if (!open) {
    // 서버에 검토할 안이 없다. 버려졌거나 적용됐거나 아직 없다 — 어느 쪽이든 로컬 초안은
    // 근거를 잃는다. 여기서 지우지 않으면 "버린 안"이 새로고침으로 되살아난다.
    if (entry.proposalId != null || entry.dirty) reset(entry);
    forgetDraft(user, courseId);
    publish(entry);
    return entry.snapshot;
  }

  const serverEdits = normalize(view?.edits);
  const serverRevision = view?.editRevision ?? 0;

  if (entry.proposalId !== proposalId) {
    // 다른 정리안이다(첫 조회이거나 새 판으로 교체됐다). 이전 편집은 이 안의 것이 아니다.
    reset(entry);
    entry.proposalId = proposalId;
    entry.revision = view?.revision ?? null;
    entry.confirmed = serverEdits;
    entry.local = serverEdits;
    entry.editRevision = serverRevision;
    restoreDraft(entry, serverEdits);
    publish(entry);
    if (entry.dirty && entry.conflicts.length === 0) schedule(entry, 0);
    return entry.snapshot;
  }

  entry.revision = view?.revision ?? entry.revision;

  if (entry.sending) {
    /*
      전송 중이다. 이 조회의 더 높은 리비전이 방금 보낸 내 저장인지 다른 탭의 저장인지
      지금은 알 수 없다. 버리지 않고 맡겨 두었다가 응답이 온 뒤 판단한다 — 응답의
      리비전보다 높으면 다른 곳의 저장이고, 그때 합친다(충돌이면 멈춘다).
    */
    if (serverRevision > entry.editRevision
      && serverRevision > (entry.pendingView?.editRevision ?? -1)) {
      entry.pendingView = { edits: serverEdits, editRevision: serverRevision };
    }
    publish(entry);
    return entry.snapshot;
  }

  if (serverRevision < entry.editRevision) {
    // 내 저장보다 먼저 떠난 조회가 늦게 왔다. 더 오래된 서버 값으로 되돌리지 않는다.
    publish(entry);
    return entry.snapshot;
  }

  if (!entry.dirty && entry.conflicts.length === 0) {
    entry.local = serverEdits;
    entry.confirmed = serverEdits;
    entry.editRevision = serverRevision;
    entry.resolutions = {};
  } else if (serverRevision > entry.editRevision) {
    // 다른 탭이 저장했다. 내 것을 지키면서 합친다.
    absorb(entry, serverEdits, serverRevision);
    persist(entry);
    if (entry.conflicts.length > 0) cancelTimer(entry);
    else if (entry.dirty) schedule(entry, 0);
  }
  publish(entry);
  return entry.snapshot;
}

/**
 * 새로고침 전 기록을 되살린다(정리안을 처음 받을 때만).
 *
 *  - v2: `기준 / 기록의 내 편집 / 지금 서버`로 합친다. 내가 바꾸지 않은 항목은 서버 최신값을
 *    따르고, 같은 항목을 양쪽이 다르게 바꿨으면 충돌로 남긴다(보내지 않는다).
 *  - 기준이 없는 옛 형식, 또는 정리안 판이 다른 기록: 무엇이 내 변경인지 알 수 없다.
 *    화면은 서버 값 그대로 두고, 기록과 다른 항목마다 "어느 쪽을 쓸지" 고르게 한다.
 */
function restoreDraft(entry, serverEdits) {
  const draft = recallDraft(entry.userKey, entry.courseId);
  if (!draft) return;
  if (draft.proposalId !== entry.proposalId) {
    forgetDraft(entry.userKey, entry.courseId);
    return;
  }

  const trustworthy = !draft.legacy && draft.v === 2 && draft.base
    && (draft.revision ?? null) === (entry.revision ?? null);

  if (!trustworthy) {
    const draftEdits = normalize(draft.edits);
    entry.conflicts = Object.entries(draftEdits)
      .filter(([changeId, value]) => !sameEdit(value, serverEdits[changeId]))
      .map(([changeId, value]) => ({
        changeId, mine: value, theirs: serverEdits[changeId] ?? null, recovered: true,
      }));
    if (entry.conflicts.length === 0) {
      forgetDraft(entry.userKey, entry.courseId);
      return;
    }
    entry.recovered = { legacy: true, savedAt: draft.savedAt ?? null };
    // 옛 기록은 이 자리에서 v2로 옮긴다(기준=지금 서버, 고를 것=충돌). 다시 새로고침해도 같다.
    forgetDraft(entry.userKey, entry.courseId);
    rememberDraft(entry);
    return;
  }

  // 기록이 만들어질 때의 상태로 되돌린 다음, 지금 서버를 "다른 곳의 저장"으로 받아들인다.
  entry.confirmed = normalize(draft.base);
  entry.local = normalize(draft.edits);
  entry.conflicts = (draft.conflicts ?? []).map((c) => ({ ...c }));
  entry.resolutions = draft.resolutions ?? {};
  absorb(entry, serverEdits, entry.editRevision);
  if (!entry.dirty && entry.conflicts.length === 0) {
    forgetDraft(entry.userKey, entry.courseId);
    return;
  }
  entry.recovered = { legacy: false, savedAt: draft.savedAt ?? null };
  rememberDraft(entry);
}

function reset(entry) {
  cancelTimer(entry);
  entry.generation += 1;
  entry.proposalId = null;
  entry.revision = null;
  entry.resolutions = {};
  entry.confirmed = {};
  entry.local = {};
  entry.editRevision = 0;
  entry.sending = null;
  entry.sendPromise = null;
  entry.pendingView = null;
  entry.dirty = false;
  entry.everSaved = false;
  entry.errorText = null;
  entry.conflicts = [];
  entry.recovered = null;
}

// ===== 사용자 편집 =====

/**
 * 사용자가 고쳤다. 화면은 즉시 바뀌고 저장은 잠시 뒤에 간다.
 *
 * 충돌 중에도 입력은 받는다(버리지 않는다). 충돌은 풀지 않는다 — 충돌 항목을 직접 고쳤으면
 * "내 값"만 그 입력으로 바꾼다. 저장은 모든 충돌이 풀린 뒤에 간다(send의 문).
 */
export function update(courseId, nextEdits) {
  const entry = entryFor(courseId);
  if (entry.proposalId == null || !sameUser(entry)) return entry.snapshot;
  const previous = entry.local;
  entry.local = normalize(nextEdits);
  if (entry.conflicts.length > 0) {
    entry.conflicts = entry.conflicts.map((c) => (
      sameEdit(previous[c.changeId], entry.local[c.changeId])
        ? c
        : { ...c, mine: entry.local[c.changeId] ?? null }
    ));
  }
  entry.dirty = !sameEdits(entry.local, entry.confirmed) || hasResolutions(entry);
  entry.errorText = null;
  persist(entry);
  schedule(entry, AUTOSAVE_MS);
  publish(entry);
  return entry.snapshot;
}

/**
 * 판이 바뀌며 옮겨 온 편집을 사용자가 정한다.
 *
 * <p>'KEEP'은 "이 편집이 이 제안에도 맞다", 'DROP'은 "내 판단을 버리고 새 제안 그대로".
 * 결정은 <b>서버가</b> 정리안 판과 대상 변경을 확인한 뒤에만 받아들인다 — 화면이 boolean
 * 하나를 보내는 것만으로 확인 표시가 풀리면, 오래된 판을 들고 있는 탭이 실수로 풀어 버릴 수
 * 있다. 그래서 여기서는 결정을 모아 두기만 하고 실제 해제는 응답으로 확인한다.
 */
export function resolveCarried(courseId, changeId, decision) {
  const entry = entryFor(courseId);
  if (entry.proposalId == null || !sameUser(entry)) return entry.snapshot;
  entry.resolutions = { ...entry.resolutions, [changeId]: decision };
  if (decision === 'DROP') {
    // 화면에서도 곧바로 편집을 거둔다. 서버가 같은 결정을 확정하면 그대로 남는다.
    const next = { ...entry.local };
    delete next[changeId];
    entry.local = normalize(next);
  } else {
    const value = entry.local[changeId];
    if (value) entry.local = normalize({ ...entry.local, [changeId]: { ...value, needsConfirm: false } });
  }
  entry.dirty = true;
  entry.errorText = null;
  rememberDraft(entry);
  schedule(entry, 0);
  publish(entry);
  return entry.snapshot;
}

/**
 * 충돌한 변경 하나를 사용자가 정한다.
 *
 * 마지막 충돌을 풀었을 때만 저장을 건다. 하나만 풀고 보내면 나머지 충돌 항목의 내 값이
 * 함께 실려 가 상대 값을 덮는다.
 */
export function resolveConflict(courseId, changeId, pick) {
  const entry = entryFor(courseId);
  const conflict = entry.conflicts.find((c) => c.changeId === changeId);
  if (!conflict || !sameUser(entry)) return entry.snapshot;
  const next = { ...entry.local };
  const chosen = pick === 'theirs' ? conflict.theirs : conflict.mine;
  if (chosen) next[changeId] = chosen; else delete next[changeId];
  entry.conflicts = entry.conflicts.filter((c) => c.changeId !== changeId);
  entry.local = withServerAuthority(normalize(next), entry.confirmed, entry.resolutions);
  entry.dirty = !sameEdits(entry.local, entry.confirmed) || hasResolutions(entry);
  if (entry.conflicts.length === 0) entry.recovered = null;
  persist(entry);
  schedule(entry, entry.dirty && entry.conflicts.length === 0 ? 0 : null);
  publish(entry);
  return entry.snapshot;
}

function cancelTimer(entry) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
}

function schedule(entry, delay) {
  cancelTimer(entry);
  if (delay == null || !entry.dirty) return;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void send(entry);
  }, delay);
}

/**
 * 지금 당장 보낸다. 화면을 떠나기 직전(패널 unmount, [나중에], [다시 저장])에 부른다.
 *
 * 떠난 뒤에도 이 모듈은 살아 있으므로 호출자가 응답을 기다릴 필요는 없다 — 기다리게 하면
 * 화면 전환이 네트워크 속도만큼 늦어진다. 그래도 결과는 정직하게 돌려준다:
 * `{ ok, reason }`에서 reason은 'conflict'(고를 것이 남음)·'error'·'switched' 등이다.
 * 이것은 <저장 보장이 아니다> — 이미 전송 중이면 그 전송의 결과를, 아니면 이번 전송의
 * 결과를 줄 뿐 그 뒤에 쌓인 편집까지 기다리지 않는다. 보장이 필요하면 ensureSaved.
 */
export function flush(courseId) {
  const entry = entries.get(courseId);
  if (!entry) return Promise.resolve({ ok: true, reason: null, proposalId: null, editRevision: 0, snapshot: null });
  cancelTimer(entry);
  return send(entry);
}

/** 보낼 수 없는 이유. 모든 전송 경로가 이 한 곳을 지난다. */
function blockReason(entry) {
  if (entry.proposalId == null) return 'closed';
  if (!sameUser(entry)) return 'switched';
  if (entry.conflicts.length > 0) return 'conflict';
  return null;
}

function send(entry, round = 0) {
  if (entry.sending && entry.sendPromise) return entry.sendPromise;
  const blocked = blockReason(entry);
  if (blocked) {
    cancelTimer(entry);
    return Promise.resolve(outcome(entry, false, blocked));
  }
  if (!entry.dirty) return Promise.resolve(outcome(entry, true));
  const promise = transmit(entry, round);
  entry.sendPromise = promise;
  return promise;
}

async function transmit(entry, round) {
  const generation = entry.generation;
  const proposalId = entry.proposalId;
  const snapshot = entry.local;
  const resolutions = entry.resolutions;
  entry.sending = snapshot;
  publish(entry);

  const stale = () => entry.generation !== generation || entry.proposalId !== proposalId;

  try {
    const saved = await projectTidyAPI.saveEdits(proposalId, {
      editRevision: entry.editRevision,
      edits: snapshot,
      ...(Object.keys(resolutions).length > 0
        ? { resolveCarried: resolutions, revision: entry.revision }
        : {}),
    });
    // 떠난 사이에 버려졌거나 다른 안으로 갈아탔으면 이 응답은 아무것도 바꾸지 못한다.
    if (stale()) return { ...outcome(entry, false, 'replaced') };
    entry.sending = null;
    entry.sendPromise = null;
    if (!sameUser(entry)) return outcome(entry, false, 'switched');

    // 보낸 결정은 서버가 받았든 거절했든 다시 보내지 않는다. 결과는 응답의 edits가 말한다.
    if (resolutions === entry.resolutions) entry.resolutions = {};
    entry.confirmed = normalize(saved?.edits ?? snapshot);
    entry.editRevision = saved?.editRevision ?? entry.editRevision;
    entry.everSaved = true;
    entry.errorText = null;

    if (sameEdits(entry.local, snapshot) && entry.conflicts.length === 0) {
      // 보내는 동안 새 입력이 없었다. 서버가 정리한 값을 그대로 받는다.
      entry.local = entry.confirmed;
      entry.dirty = hasResolutions(entry);
    } else {
      // 보내는 동안 사용자가 더 고쳤다. 더 최근 값이 이긴다 — 되돌리지 않는다.
      entry.dirty = !sameEdits(entry.local, entry.confirmed) || hasResolutions(entry);
    }

    // 전송 중에 맡겨 둔 조회가 이 응답보다 새 것이면 다른 곳의 저장이다. 이제 합친다.
    const pending = entry.pendingView;
    entry.pendingView = null;
    if (pending && pending.editRevision > entry.editRevision) {
      absorb(entry, pending.edits, pending.editRevision);
    }
    if (entry.conflicts.length === 0) entry.recovered = null;
    persist(entry);
    publish(entry);
    if (entry.conflicts.length > 0) {
      cancelTimer(entry);
      return outcome(entry, false, 'conflict');
    }
    if (entry.dirty) schedule(entry, 0);
    return outcome(entry, true);
  } catch (err) {
    if (stale()) return outcome(entry, false, 'replaced');
    entry.sending = null;
    entry.sendPromise = null;
    if (!sameUser(entry)) return outcome(entry, false, 'switched');
    entry.pendingView = null;

    if (err?.code === 'E409_029' && round < MAX_CONFLICT_ROUNDS) {
      return reconcile(entry, generation, proposalId, round);
    }
    // 편집은 그대로 둔다. 복구 저장소에도 남긴다 — 실패를 삼키고 "저장됨"으로 만들지 않는다.
    entry.errorText = err?.message || '고친 내용을 저장하지 못했어요.';
    rememberDraft(entry);
    publish(entry);
    return outcome(entry, false, 'error');
  }
}

/** 409. 서버 최신본을 읽어 합친 뒤 다시 보낸다. 내 편집을 버리지 않는다. */
async function reconcile(entry, generation, proposalId, round) {
  const stale = () => entry.generation !== generation || entry.proposalId !== proposalId;
  try {
    const latest = await projectTidyAPI.get(entry.courseId);
    if (stale()) return outcome(entry, false, 'replaced');
    if (!sameUser(entry)) return outcome(entry, false, 'switched');
    if (latest?.proposalId !== proposalId || latest?.status !== 'PROPOSED') {
      // 그 사이 적용되거나 버려졌다. 여기서 되살리지 않는다.
      adopt(entry.courseId, latest);
      return outcome(entry, false, 'replaced');
    }
    absorb(entry, normalize(latest?.edits), latest?.editRevision ?? entry.editRevision);
    entry.errorText = null;
    persist(entry);
    publish(entry);
    /*
      충돌이 남아 있으면 다시 보내지 않는다. 내 값을 그대로 밀어붙이면 상대의 값을 덮어쓰게
      되고, 서버가 또 거절하면 같은 왕복만 반복한다. 사용자가 고른 뒤에 보낸다
      (resolveConflict가 다시 걸어 준다).
    */
    if (entry.conflicts.length > 0) return outcome(entry, false, 'conflict');
    if (entry.dirty) return send(entry, round + 1);
    return outcome(entry, true);
  } catch (err) {
    if (stale()) return outcome(entry, false, 'replaced');
    entry.errorText = err?.message || '다른 곳에서 먼저 고쳤어요. 잠시 뒤 다시 저장할게요.';
    rememberDraft(entry);
    publish(entry);
    return outcome(entry, false, 'error');
  }
}

/**
 * 다음 작업이 저장된 편집에 기대기 전에 부른다(예: 다시 정리 — 서버는 <저장된> 편집만 새 판으로
 * 옮긴다).
 *
 * 전송 중인 요청을 기다리고, 그 사이·그 뒤에 쌓인 편집까지 보내 서버가 확인할 때까지 되풀이한다.
 * 기다리는 동안 들어온 편집도 <포함한다> — 사용자가 마지막으로 본 내용이 승계되는 내용이어야
 * 하기 때문이다(화면은 기다리는 동안 입력을 막아, 보통은 새 입력이 없다).
 *
 * 결과 `{ ok, reason, editRevision }`. ok=false의 reason:
 *   'conflict'  고를 것이 남았다(보내지 않았다)
 *   'error'     저장이 실패했다(편집은 남아 있다)
 *   'replaced'  기다리는 사이 정리안이 버려지거나 바뀌었다
 *   'switched'  기다리는 사이 계정이 바뀌었다
 *   'timeout'   한도 안에 확인받지 못했다
 *   'busy'      되풀이 한도 안에 편집이 멎지 않았다
 */
export async function ensureSaved(courseId, { timeoutMs = ENSURE_TIMEOUT_MS } = {}) {
  const entry = entries.get(courseId);
  if (!entry || entry.proposalId == null) {
    return { ok: true, reason: null, proposalId: null, editRevision: 0, snapshot: entry?.snapshot ?? null };
  }
  const generation = entry.generation;
  const proposalId = entry.proposalId;
  const user = entry.userKey;

  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const within = async (promise) => {
    const result = await Promise.race([promise, timeout]);
    return result === 'timeout' ? null : result;
  };

  try {
    for (let round = 0; round < MAX_ENSURE_ROUNDS; round += 1) {
      if (entry.generation !== generation || entry.proposalId !== proposalId) return outcome(entry, false, 'replaced');
      if (currentUserKey() !== user) return outcome(entry, false, 'switched');
      if (entry.conflicts.length > 0) return outcome(entry, false, 'conflict');

      if (entry.sending && entry.sendPromise) {
        const settled = await within(entry.sendPromise);
        if (settled == null) return outcome(entry, false, 'timeout');
        if (!settled.ok && settled.reason !== 'replaced') return outcome(entry, false, settled.reason);
        continue;
      }
      if (!entry.dirty) return outcome(entry, true);

      cancelTimer(entry);
      const result = await within(send(entry));
      if (result == null) return outcome(entry, false, 'timeout');
      if (!result.ok) {
        const reason = entry.generation !== generation || entry.proposalId !== proposalId ? 'replaced' : result.reason;
        return outcome(entry, false, reason);
      }
    }
    return outcome(entry, false, 'busy');
  } finally {
    clearTimeout(timer);
  }
}

// ===== 생명주기 =====

/**
 * 적용·폐기가 서버에서 확정된 뒤 부른다. 세대를 올려 이전 응답을 전부 무효로 만들고
 * 복구 데이터를 지운다. 낙관적으로 미리 부르지 않는다 — 실패하면 편집을 잃는다.
 */
export function clear(courseId) {
  const entry = entries.get(courseId);
  const user = entry?.userKey ?? currentUserKey();
  if (!entry) {
    forgetDraft(user, courseId);
    return;
  }
  reset(entry);
  forgetDraft(user, courseId);
  publish(entry);
}

/** 아직 서버에 닿지 않은 편집이 있는가. 적용 버튼을 막는 근거다. */
export function hasUnsaved(courseId) {
  const entry = entries.get(courseId);
  return !!entry && (entry.dirty || !!entry.sending || entry.conflicts.length > 0);
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
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch { /* 무시 */ }
  }
}
