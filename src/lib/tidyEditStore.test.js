/**
 * 검토 편집 저장소 — 복구·충돌·저장 보장.
 *
 * 화면을 거치지 않고 실제 저장소 함수를 부른다. API만 가짜이고, 응답 순서는 deferred로,
 * 자동 저장 타이머는 가짜 타이머로 우리가 정한다. 판정은 화면 문구가 아니라
 * <실제로 나간 요청의 수·리비전·편집 내용>이다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api/api.js', () => ({
  projectTidyAPI: { get: vi.fn(), saveEdits: vi.fn() },
}));

import { projectTidyAPI } from '../api/api.js';
import * as store from './tidyEditStore.js';

const COURSE = 6;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const view = (editRevision, edits, extra = {}) => ({
  courseId: COURSE, proposalId: 11, status: 'PROPOSED', revision: 1, editRevision, edits, ...extra,
});

const tokenFor = (sub) => `x.${btoa(JSON.stringify({ sub }))}.y`;

/** 서버는 받은 편집을 그대로 저장하고 리비전을 하나 올린다. 호출 기록이 판정 근거다. */
function echoServer(startRevision) {
  let revision = startRevision;
  projectTidyAPI.saveEdits.mockImplementation((_id, body) => {
    revision += 1;
    return Promise.resolve(view(revision, body.edits));
  });
}

const sent = () => projectTidyAPI.saveEdits.mock.calls.map(([, body]) => body);

/** 새로고침: 모듈 상태는 사라지고 localStorage만 남는다. */
const reload = () => store.__resetAll({ keepStorage: true });

beforeEach(() => {
  vi.clearAllMocks();
  store.__resetAll();
  localStorage.clear();
  vi.useFakeTimers();
  localStorage.setItem('token', tokenFor(7));
});

afterEach(() => {
  vi.useRealTimers();
  store.__resetAll();
  localStorage.clear();
});

// ===== 1. 새로고침 복구 =====

describe('새로고침 복구는 다른 곳의 최신 편집을 덮지 않는다', () => {
  it('A만 고쳤고 그 사이 다른 탭이 B를 고쳤으면 A는 내 값, B는 서버 값으로 저장한다', async () => {
    projectTidyAPI.saveEdits.mockReturnValue(new Promise(() => {}));
    store.adopt(COURSE, view(1, { a: { title: 'old-A' }, b: { title: 'old-B' } }));
    store.update(COURSE, { a: { title: 'my-A' }, b: { title: 'old-B' } });
    // 자동 저장이 나가기 전에 새로고침한다.
    reload();

    // 그 사이 다른 탭이 B를 revision=2로 저장했다.
    projectTidyAPI.saveEdits.mockReset();
    echoServer(2);
    store.adopt(COURSE, view(2, { a: { title: 'old-A' }, b: { title: 'other-tab-B' } }));
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(1);
    expect(sent()[0].editRevision).toBe(2);
    expect(sent()[0].edits).toEqual({
      a: { excluded: false, title: 'my-A' },
      b: { excluded: false, title: 'other-tab-B' },
    });
    expect(store.getSnapshot(COURSE).conflicts).toEqual([]);
  });

  it('같은 항목을 양쪽에서 다르게 고쳤으면 충돌로 두고 보내지 않는다', async () => {
    projectTidyAPI.saveEdits.mockReturnValue(new Promise(() => {}));
    store.adopt(COURSE, view(1, { a: { title: 'old-A' } }));
    store.update(COURSE, { a: { title: 'my-A' } });
    reload();

    projectTidyAPI.saveEdits.mockReset();
    echoServer(2);
    store.adopt(COURSE, view(2, { a: { title: 'other-A' } }));
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(0);
    const snap = store.getSnapshot(COURSE);
    expect(snap.conflicts).toHaveLength(1);
    expect(snap.conflicts[0]).toMatchObject({ changeId: 'a', mine: { title: 'my-A' }, theirs: { title: 'other-A' } });
    // 화면에는 내 값이 남는다 — 골라야 할 것이 보이도록.
    expect(snap.edits.a.title).toBe('my-A');
  });

  it('서버에서 지워진 편집·제외 해제는 내가 건드리지 않았다면 최신 상태를 따른다', async () => {
    projectTidyAPI.saveEdits.mockReturnValue(new Promise(() => {}));
    store.adopt(COURSE, view(1, { a: { title: 'old-A' }, b: { title: 'old-B' }, c: { excluded: true } }));
    store.update(COURSE, { a: { title: 'my-A' }, b: { title: 'old-B' }, c: { excluded: true } });
    reload();

    projectTidyAPI.saveEdits.mockReset();
    echoServer(2);
    // 다른 탭이 B의 제목을 지우고 C의 제외를 풀었다.
    store.adopt(COURSE, view(2, { a: { title: 'old-A' } }));
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(1);
    expect(sent()[0].edits).toEqual({ a: { excluded: false, title: 'my-A' } });
  });

  it('내가 비운 제목과 내가 푼 제외는 복구 뒤에도 "바꾼 것"으로 남는다', async () => {
    projectTidyAPI.saveEdits.mockReturnValue(new Promise(() => {}));
    store.adopt(COURSE, view(1, { a: { title: 'old-A' }, c: { excluded: true } }));
    store.update(COURSE, { a: { title: '' } });
    reload();

    projectTidyAPI.saveEdits.mockReset();
    echoServer(2);
    store.adopt(COURSE, view(2, { a: { title: 'old-A' }, c: { excluded: true }, d: { title: 'other-D' } }));
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(1);
    // a는 내가 비운 제목(''), c는 내가 푼 제외(항목 없음) 그대로 간다. d는 다른 탭의 값.
    expect(sent()[0].edits).toEqual({
      a: { excluded: false, title: '' },
      d: { excluded: false, title: 'other-D' },
    });
  });

  it('확인 표시(needsConfirm)는 복구한 편집이 아니라 서버 값을 따른다', async () => {
    projectTidyAPI.saveEdits.mockReturnValue(new Promise(() => {}));
    const carried = { excluded: true, title: null, needsConfirm: true, carriedFrom: { changeId: 'o', text: 't', reason: 'r' } };
    store.adopt(COURSE, view(1, { a: carried }));
    store.update(COURSE, { a: carried, b: { title: 'my-B' } });
    reload();

    projectTidyAPI.saveEdits.mockReset();
    echoServer(2);
    // 다른 탭이 그 사이 a를 확인했다(needsConfirm 해제).
    store.adopt(COURSE, view(2, { a: { excluded: true, title: null } }));
    await vi.runAllTimersAsync();

    expect(store.getSnapshot(COURSE).unconfirmed).toEqual([]);
    expect(sent()[0].edits.b.title).toBe('my-B');
  });

  it('기준이 없는 옛 형식 복구 데이터는 자동으로 보내지 않고 고를 수 있게 남긴다', async () => {
    localStorage.setItem('tidyEdits:v1', JSON.stringify({
      [`7:${COURSE}`]: { proposalId: 11, editRevision: 1, edits: { a: { excluded: false, title: 'legacy-A' } }, savedAt: 1 },
    }));
    echoServer(2);
    store.adopt(COURSE, view(2, { a: { title: 'server-A' }, b: { title: 'server-B' } }));
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(0);
    const snap = store.getSnapshot(COURSE);
    expect(snap.edits.a.title).toBe('server-A');
    expect(snap.recovered).toMatchObject({ legacy: true });
    expect(snap.conflicts.map((c) => [c.changeId, c.mine?.title, c.theirs?.title]))
      .toEqual([['a', 'legacy-A', 'server-A']]);
  });

  it('다른 사용자의 복구 데이터는 쓰지 않는다', async () => {
    projectTidyAPI.saveEdits.mockReturnValue(new Promise(() => {}));
    store.adopt(COURSE, view(1, {}));
    store.update(COURSE, { a: { title: 'seven-A' } });
    reload();

    localStorage.setItem('token', tokenFor(8));
    projectTidyAPI.saveEdits.mockReset();
    echoServer(1);
    store.adopt(COURSE, view(1, {}));
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(0);
    expect(store.getSnapshot(COURSE).edits).toEqual({});
  });

  it('버려졌거나 바뀐 정리안의 복구 데이터는 되살리지 않는다', async () => {
    projectTidyAPI.saveEdits.mockReturnValue(new Promise(() => {}));
    store.adopt(COURSE, view(1, {}));
    store.update(COURSE, { a: { title: 'mine' } });
    reload();

    projectTidyAPI.saveEdits.mockReset();
    echoServer(0);
    store.adopt(COURSE, { ...view(0, {}), proposalId: 12 });
    await vi.runAllTimersAsync();
    expect(sent()).toHaveLength(0);
    expect(store.getSnapshot(COURSE).edits).toEqual({});

    reload();
    store.adopt(COURSE, { courseId: COURSE, proposalId: null, status: null, edits: {} });
    expect(localStorage.getItem('tidyEdits:v2')).toBeNull();
  });

  it('계정을 바꾼 뒤 남은 타이머는 앞 사용자의 편집을 새 사용자 이름으로 보내거나 남기지 않는다', async () => {
    echoServer(1);
    store.adopt(COURSE, view(1, {}));
    store.update(COURSE, { a: { title: 'seven-A' } });
    // 700ms 안에 로그아웃하고 다른 계정으로 들어왔다.
    localStorage.setItem('token', tokenFor(8));
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(0);
    const saved = JSON.parse(localStorage.getItem('tidyEdits:v2') ?? '{}');
    expect(Object.keys(saved).some((key) => key.startsWith('8:'))).toBe(false);
  });
});

// ===== 2. 미해결 충돌 중 전송 금지 =====

describe('충돌이 남아 있으면 어떤 경로로도 보내지 않는다', () => {
  /** 기준 base → 내 mine(예약 저장 대기) → 더 높은 리비전의 서버 theirs. */
  function conflictOn(keys = ['a']) {
    const base = {};
    const mine = {};
    const theirs = {};
    keys.forEach((k) => {
      base[k] = { title: `base-${k}` };
      mine[k] = { title: `mine-${k}` };
      theirs[k] = { title: `theirs-${k}` };
    });
    store.adopt(COURSE, view(1, base));
    store.update(COURSE, mine);
    store.adopt(COURSE, view(2, theirs));
  }

  it('예약 저장이 걸린 뒤 충돌이 생기면 그 예약은 나가지 않는다', async () => {
    echoServer(2);
    conflictOn();
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(0);
    expect(store.getSnapshot(COURSE).status).toBe('conflict');
  });

  it('저장 409 뒤 합치다 충돌이 나면 멈춘다 — 409 왕복을 반복하지 않는다', async () => {
    projectTidyAPI.saveEdits.mockRejectedValue(Object.assign(new Error('x'), { code: 'E409_029' }));
    projectTidyAPI.get.mockResolvedValue(view(5, { a: { title: 'theirs-a' } }));
    store.adopt(COURSE, view(1, { a: { title: 'base-a' } }));
    store.update(COURSE, { a: { title: 'mine-a' } });
    await vi.runAllTimersAsync();

    expect(projectTidyAPI.saveEdits).toHaveBeenCalledTimes(1);
    expect(projectTidyAPI.get).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot(COURSE).conflicts).toHaveLength(1);

    store.update(COURSE, { a: { title: 'mine-a' }, b: { title: 'more' } });
    await store.flush(COURSE);
    await vi.runAllTimersAsync();
    expect(projectTidyAPI.saveEdits).toHaveBeenCalledTimes(1);
  });

  it('충돌 중 다른 항목을 고치면 입력은 남고 충돌은 풀리지 않으며 보내지 않는다', async () => {
    echoServer(2);
    conflictOn();
    store.update(COURSE, { ...store.getSnapshot(COURSE).edits, b: { title: 'typed-B' } });
    await vi.runAllTimersAsync();

    expect(sent()).toHaveLength(0);
    const snap = store.getSnapshot(COURSE);
    expect(snap.edits.b.title).toBe('typed-B');
    expect(snap.conflicts.map((c) => c.changeId)).toEqual(['a']);
  });

  it('두 충돌 중 하나만 풀면 보내지 않고, 둘 다 풀면 고른 값과 최신 리비전으로 한 번 보낸다', async () => {
    echoServer(2);
    conflictOn(['a', 'b']);
    store.update(COURSE, { ...store.getSnapshot(COURSE).edits, c: { title: 'typed-C' } });

    store.resolveConflict(COURSE, 'a', 'theirs');
    await vi.runAllTimersAsync();
    expect(sent()).toHaveLength(0);

    store.resolveConflict(COURSE, 'b', 'mine');
    await vi.runAllTimersAsync();
    expect(sent()).toHaveLength(1);
    expect(sent()[0].editRevision).toBe(2);
    expect(sent()[0].edits).toEqual({
      a: { excluded: false, title: 'theirs-a' },
      b: { excluded: false, title: 'mine-b' },
      c: { excluded: false, title: 'typed-C' },
    });
    expect(store.getSnapshot(COURSE).status).toBe('saved');
  });

  it('충돌 중 flush는 성공처럼 끝나지 않고 막혔다고 알린다', async () => {
    echoServer(2);
    conflictOn();
    const result = await store.flush(COURSE);

    expect(result).toMatchObject({ ok: false, reason: 'conflict' });
    expect(sent()).toHaveLength(0);
  });

  it('충돌 중에는 저장 보장도 막힌다', async () => {
    echoServer(2);
    conflictOn();
    const result = await store.ensureSaved(COURSE);
    expect(result).toMatchObject({ ok: false, reason: 'conflict' });
    expect(sent()).toHaveLength(0);
  });

  it('전송 중이던 요청이 성공으로 돌아와도 그 사이 생긴 충돌을 덮거나 전송을 재개하지 않는다', async () => {
    const first = deferred();
    projectTidyAPI.saveEdits.mockReturnValueOnce(first.promise);
    store.adopt(COURSE, view(1, { a: { title: 'base-a' } }));
    store.update(COURSE, { a: { title: 'mine-a' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(projectTidyAPI.saveEdits).toHaveBeenCalledTimes(1);

    // 요청이 날아가는 동안 사용자가 B를 고친다(다음 전송으로 모인다).
    store.update(COURSE, { a: { title: 'mine-a' }, b: { title: 'mine-b' } });
    await vi.advanceTimersByTimeAsync(800);
    expect(projectTidyAPI.saveEdits).toHaveBeenCalledTimes(1);

    // 같은 때 조회가 도착한다: 다른 탭이 B를 다르게 고쳐 revision=3을 만들었다.
    store.adopt(COURSE, view(3, { a: { title: 'mine-a' }, b: { title: 'other-b' } }));
    // 그 뒤 첫 요청의 성공 응답이 온다(revision=2).
    first.resolve(view(2, { a: { title: 'mine-a' } }));
    await vi.runAllTimersAsync();

    // 응답이 "보낼 것 남음"을 이유로 B를 밀어붙이면 다른 탭의 B를 덮는다. 충돌로 멈춰야 한다.
    const snap = store.getSnapshot(COURSE);
    expect(snap.conflicts.map((c) => c.changeId)).toEqual(['b']);
    expect(snap.edits.b.title).toBe('mine-b');
    expect(projectTidyAPI.saveEdits).toHaveBeenCalledTimes(1);
  });
});

// ===== 3. 저장 보장 =====

describe('ensureSaved — 다음 작업 전에 서버가 확인할 때까지 기다린다', () => {
  it('전송 중인 요청과 그 뒤에 쌓인 편집이 모두 확인된 뒤에야 끝난다', async () => {
    const first = deferred();
    const second = deferred();
    projectTidyAPI.saveEdits.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    store.adopt(COURSE, view(1, {}));
    store.update(COURSE, { a: { title: 'A' } });
    await vi.advanceTimersByTimeAsync(800);

    let result = null;
    const waiting = store.ensureSaved(COURSE).then((r) => { result = r; });
    // 기다리는 동안 B가 들어왔다.
    store.update(COURSE, { a: { title: 'A' }, b: { title: 'B' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBeNull();

    first.resolve(view(2, { a: { title: 'A' } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBeNull();
    expect(projectTidyAPI.saveEdits).toHaveBeenCalledTimes(2);
    expect(sent()[1]).toMatchObject({ editRevision: 2, edits: { a: { title: 'A' }, b: { title: 'B' } } });

    second.resolve(view(3, { a: { title: 'A' }, b: { title: 'B' } }));
    await waiting;
    expect(result).toMatchObject({ ok: true, editRevision: 3 });
  });

  it('저장이 실패하면 실패로 끝나고 편집은 남는다', async () => {
    projectTidyAPI.saveEdits.mockRejectedValue(new Error('네트워크'));
    store.adopt(COURSE, view(1, {}));
    store.update(COURSE, { a: { title: 'A' } });
    const result = await store.ensureSaved(COURSE);
    expect(result).toMatchObject({ ok: false, reason: 'error' });
    expect(store.getSnapshot(COURSE).edits.a.title).toBe('A');
  });

  it('기다리는 동안 정리안이 버려지면 교체로 끝난다', async () => {
    const first = deferred();
    projectTidyAPI.saveEdits.mockReturnValueOnce(first.promise);
    store.adopt(COURSE, view(1, {}));
    store.update(COURSE, { a: { title: 'A' } });
    const waiting = store.ensureSaved(COURSE);
    await vi.advanceTimersByTimeAsync(0);
    store.clear(COURSE);
    first.resolve(view(2, { a: { title: 'A' } }));
    expect(await waiting).toMatchObject({ ok: false, reason: 'replaced' });
  });

  it('기다리는 동안 계정이 바뀌면 멈춘다', async () => {
    const first = deferred();
    projectTidyAPI.saveEdits.mockReturnValueOnce(first.promise);
    store.adopt(COURSE, view(1, {}));
    store.update(COURSE, { a: { title: 'A' } });
    const waiting = store.ensureSaved(COURSE);
    await vi.advanceTimersByTimeAsync(0);
    localStorage.setItem('token', tokenFor(8));
    first.resolve(view(2, { a: { title: 'A' } }));
    expect(await waiting).toMatchObject({ ok: false, reason: 'switched' });
  });

  it('보낼 것이 없으면 바로 끝난다', async () => {
    store.adopt(COURSE, view(4, { a: { title: 'A' } }));
    expect(await store.ensureSaved(COURSE)).toMatchObject({ ok: true, editRevision: 4 });
    expect(projectTidyAPI.saveEdits).not.toHaveBeenCalled();
  });
});
