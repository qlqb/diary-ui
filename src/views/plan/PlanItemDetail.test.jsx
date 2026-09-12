import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PlanItemDetail from './PlanItemDetail.jsx';
import { planAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: {
    draftItemDetail: vi.fn(), createDraftItemDetail: vi.fn(), itemDetail: vi.fn(), createItemDetail: vi.fn(),
  },
  materialStoreAPI: { file: vi.fn() },
}));

const ready = {
  detailId: 3, proposalItemId: 11, evidenceVersion: 'v1', available: true, canGenerate: true, stale: false,
  steps: [
    { text: '실습 문제 3번을 먼저 풀어 본다', refIds: ['s9'], sectionIds: [10] },
    { text: '막히면 삭제 예제를 확인한다', refIds: [], sectionIds: [] },
  ],
  sections: [{ sectionId: 10, materialId: 7, title: '연습문제 3', locator: 'p.12' }],
};

describe('계획 항목 「자세히」', () => {
  beforeEach(() => vi.clearAllMocks());

  it('접혀 있으면 아무 요청도 하지 않는다 — 펼치는 것이 곧 요청이다', () => {
    render(<PlanItemDetail id={11} expanded={false} />);
    expect(planAPI.draftItemDetail).not.toHaveBeenCalled();
  });

  it('처음 펼칠 때 없으면 한 번 만들고, 이미 있으면 만들지 않는다', async () => {
    planAPI.draftItemDetail.mockResolvedValueOnce({ proposalItemId: 11, available: false, canGenerate: true, steps: [] });
    planAPI.createDraftItemDetail.mockResolvedValueOnce(ready);
    const { rerender } = render(<PlanItemDetail id={11} expanded />);

    expect(await screen.findByText('실습 문제 3번을 먼저 풀어 본다')).toBeInTheDocument();
    expect(planAPI.createDraftItemDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/연습문제 3 \(p.12\)/)).toBeInTheDocument();

    planAPI.draftItemDetail.mockResolvedValueOnce(ready);
    rerender(<PlanItemDetail id={11} expanded={false} />);
    rerender(<PlanItemDetail id={11} expanded />);
    await waitFor(() => expect(planAPI.draftItemDetail).toHaveBeenCalledTimes(2));
    expect(planAPI.createDraftItemDetail).toHaveBeenCalledTimes(1);
  });

  it('근거 자료가 없는 항목은 만들지 않고 그 사실을 말한다', async () => {
    planAPI.draftItemDetail.mockResolvedValueOnce({ proposalItemId: 11, available: false, canGenerate: false, steps: [] });
    render(<PlanItemDetail id={11} expanded />);
    expect(await screen.findByText(/자세히 볼 근거 자료가 없어요/)).toBeInTheDocument();
    expect(planAPI.createDraftItemDetail).not.toHaveBeenCalled();
  });

  it('옛 원문 기준 안내는 최신이라고 표시하지 않는다', async () => {
    planAPI.draftItemDetail.mockResolvedValueOnce({ ...ready, stale: true });
    render(<PlanItemDetail id={11} expanded />);
    expect(await screen.findByText(/이전 원문 기준으로 만든 안내예요/)).toBeInTheDocument();
  });

  it('늦게 도착한 옛 항목의 응답이 새 항목을 덮지 않는다', async () => {
    let resolveOld;
    planAPI.draftItemDetail.mockImplementationOnce(() => new Promise((r) => { resolveOld = r; }));
    planAPI.draftItemDetail.mockResolvedValueOnce({ ...ready, proposalItemId: 12,
      steps: [{ text: '새 항목의 단계', refIds: [], sectionIds: [] }] });
    const { rerender } = render(<PlanItemDetail id={11} expanded />);
    rerender(<PlanItemDetail id={12} expanded />);
    expect(await screen.findByText('새 항목의 단계')).toBeInTheDocument();
    resolveOld({ ...ready, steps: [{ text: '옛 항목의 단계', refIds: [], sectionIds: [] }] });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText('옛 항목의 단계')).not.toBeInTheDocument();
    expect(screen.getByText('새 항목의 단계')).toBeInTheDocument();
  });
});
