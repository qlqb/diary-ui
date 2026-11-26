/**
 * 상담 초안 상태의 계약.
 *
 * 가장 중요한 것: 늦게 도착한 옛 요청의 결과가 더 새로운 초안을 덮지 않는다. 그리고 답이 바뀌어 초안이 낡아도
 * 지우지 않는다 — "이전 버전"으로 표시하고 다시 만들기는 사용자가 누른다.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useConsultDraft } from './useConsultDraft.js';
import { planAPI, proposalAPI } from '../api/api.js';

vi.mock('../api/api.js', () => ({
  planAPI: { redraft: vi.fn(), draftProgress: vi.fn() },
  proposalAPI: { dismiss: vi.fn() },
}));

const draftOf = (proposalId, extra = {}) => ({
  proposalId, suggestedTitle: `초안 ${proposalId}`, proposal: { proposalId, items: [] }, ...extra,
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  planAPI.draftProgress.mockResolvedValue({ known: false });
});

describe('낡은 초안 표시', () => {
  it('방향이 바뀌면 열린 초안을 지우지 않고 낡았다고만 표시한다', () => {
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));
    expect(result.current.stale).toBe(false);

    act(() => result.current.markStale(null, 'DIRECTION'));

    expect(result.current.stale).toBe(true);
    expect(result.current.draft.proposalId).toBe(77);
  });

  it('고친 기억이 가리키는 초안이 지금 열린 초안일 때만 표시한다', () => {
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));

    act(() => result.current.markStale([12, 13], 'UNDERSTANDING'));
    expect(result.current.stale).toBe(false);

    act(() => result.current.markStale([77], 'UNDERSTANDING'));
    expect(result.current.stale).toBe(true);
  });

  it('서버가 낡았다고 알려 준 초안(freshness)은 처음부터 낡은 것이다', () => {
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77, { freshness: { state: 'STALE', reasons: ['가능한 시간이 달라졌어요'] } })));

    expect(result.current.stale).toBe(true);
    expect(result.current.staleReasons).toEqual(['가능한 시간이 달라졌어요']);
  });
});

describe('다시 만들기', () => {
  it('만드는 동안 이전 초안을 그대로 들고 있고, 끝나면 새 초안과 달라진 점·옮긴 편집·부딪친 편집을 준다', async () => {
    const pending = deferred();
    planAPI.redraft.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));
    act(() => result.current.markStale(null));

    let done;
    act(() => { done = result.current.regenerate({}); });

    expect(result.current.regenerating).toBe(true);
    // 빈 화면으로 기다리게 하지 않는다 — 이전 버전이 그대로 있다.
    expect(result.current.draft.proposalId).toBe(77);
    expect(planAPI.redraft).toHaveBeenCalledWith(77, expect.objectContaining({ requestKey: expect.any(String) }));

    await act(async () => {
      pending.resolve(draftOf(78, {
        strategy: { changes: [{ what: '과제 2번을 앞으로', why: '금요일 마감' }] },
        carriedEdits: [{ title: '연결 리스트 구현', fields: ['expectedMinutes'] }],
        editConflicts: [{ title: '통계 복습', field: 'expectedMinutes', yours: 20, suggested: 45 }],
      }));
      await done;
    });

    expect(result.current.regenerating).toBe(false);
    expect(result.current.draft.proposalId).toBe(78);
    expect(result.current.stale).toBe(false);
    expect(result.current.outcome.changes).toEqual([{ what: '과제 2번을 앞으로', why: '금요일 마감' }]);
    expect(result.current.outcome.carriedEdits).toHaveLength(1);
    expect(result.current.outcome.editConflicts[0]).toMatchObject({ yours: 20, suggested: 45 });
  });

  it('못 만들면 이전 초안과 낡음 표시를 그대로 둔다', async () => {
    planAPI.redraft.mockRejectedValue(new Error('지금은 다시 만들 수 없어요.'));
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));
    act(() => result.current.markStale(null));

    await act(async () => { await result.current.regenerate({}); });

    expect(result.current.draft.proposalId).toBe(77);
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toBe('지금은 다시 만들 수 없어요.');
    expect(result.current.regenerating).toBe(false);
  });

  it('★ 늦게 도착한 옛 요청의 결과는 그 사이 대화가 가져온 더 새로운 초안을 덮지 않는다', async () => {
    const slow = deferred();
    planAPI.redraft.mockReturnValue(slow.promise);
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));

    let done;
    act(() => { done = result.current.regenerate({}); });
    // 다시 만들기를 기다리는 사이, 대화가 새 초안(90)을 가져왔다.
    act(() => result.current.accept(draftOf(90)));
    expect(result.current.regenerating).toBe(false);

    let ok;
    await act(async () => {
      slow.resolve(draftOf(78));
      ok = await done;
    });

    expect(ok).toBe(false);
    expect(result.current.draft.proposalId).toBe(90);
    expect(result.current.outcome).toBeNull();
  });

  it('★ 두 번 눌렀을 때도 나중 요청의 결과만 남는다 — 먼저 보낸 것이 늦게 와도 덮지 않는다', async () => {
    const first = deferred();
    const second = deferred();
    planAPI.redraft.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));

    let doneFirst;
    let doneSecond;
    act(() => { doneFirst = result.current.regenerate({}); });
    act(() => { doneSecond = result.current.regenerate({ excludeTopicIds: [5] }); });

    await act(async () => { second.resolve(draftOf(80)); await doneSecond; });
    expect(result.current.draft.proposalId).toBe(80);

    await act(async () => { first.resolve(draftOf(79)); await doneFirst; });
    expect(result.current.draft.proposalId).toBe(80);
    await waitFor(() => expect(result.current.regenerating).toBe(false));
  });

  it('늦게 온 실패도 새 초안 위에 오류를 띄우지 않는다', async () => {
    const slow = deferred();
    planAPI.redraft.mockReturnValue(slow.promise);
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));

    let done;
    act(() => { done = result.current.regenerate({}); });
    act(() => result.current.accept(draftOf(90)));
    await act(async () => { slow.reject(new Error('옛 요청의 오류')); await done; });

    expect(result.current.error).toBeNull();
    expect(result.current.draft.proposalId).toBe(90);
  });
});

describe('적용', () => {
  it('적용하면 초안은 비고 적용된 계획을 기억한다', () => {
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));

    act(() => result.current.markApplied({ planVersionId: 5, title: '이번 주 계획' }));

    expect(result.current.draft).toBeNull();
    expect(result.current.applied).toMatchObject({ title: '이번 주 계획', plan: { planVersionId: 5 } });
  });
});

describe('초안 버리기', () => {
  it('버리기는 서버에도 쓴다 — 되살리기가 다시 열지 않게', async () => {
    proposalAPI.dismiss.mockResolvedValue(undefined);
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(77)));

    act(() => result.current.discard());

    expect(result.current.draft).toBeNull();
    await waitFor(() => expect(proposalAPI.dismiss).toHaveBeenCalledWith(77));
  });

  it('확정 뒤 화면 정리(clear)는 서버에 버렸다고 쓰지 않는다', () => {
    const { result } = renderHook(() => useConsultDraft());
    act(() => result.current.accept(draftOf(78)));

    act(() => result.current.clear());

    expect(proposalAPI.dismiss).not.toHaveBeenCalled();
  });
});
