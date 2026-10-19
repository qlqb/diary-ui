import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemWorkspace from './ItemWorkspace.jsx';
import { executionItemAPI, planAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  executionItemAPI: {
    workspace: vi.fn(), requestStartHelp: vi.fn(), updateRecordReflection: vi.fn(),
    complete: vi.fn(), partial: vi.fn(), reduce: vi.fn(), move: vi.fn(), resume: vi.fn(), delete: vi.fn(),
  },
  planAPI: {
    itemDetail: vi.fn(), createItemDetail: vi.fn(), saveItemMemo: vi.fn(), itemProvenance: vi.fn(),
    draftItemDetail: vi.fn(), createDraftItemDetail: vi.fn(), saveDraftItemMemo: vi.fn(),
  },
  materialStoreAPI: { file: vi.fn() },
}));

/**
 * 작업 공간이 약속하는 것:
 *   - 열자마자 목표·첫 행동·시작 자료·완료 기준이 보이고, 이것만으로 모델을 부르지 않는다.
 *   - 시작 도움은 요청할 때만 만들고, 범위를 바꾸지 않는다고 말한다.
 *   - 기록의 "어떻게 했나"는 고칠 수 있고, 도움받은 기록이 있으면 조정안 상담으로 갈 수 있다(자동 변경 없음).
 */
const ITEM = {
  executionItemId: 501, title: '연결 리스트 · 삽입 함수 작성', version: 3, status: 'PLANNED',
  description: '예제 4-2를 따라 치고 조건만 바꿔 실행 · 완료: 빈 리스트·중간·끝 삽입 3개 통과',
  scheduledDate: '2026-09-29', estimatedMinutes: 40, priority: 'SHOULD',
};

function workspace(overrides = {}) {
  return {
    item: ITEM,
    doneCriteria: '빈 리스트·중간·끝 삽입 3개 통과',
    courseTitle: '자료구조', topicTitle: '연결 리스트',
    proposalItemId: 77, leftoverOfId: null, changedSinceDraft: false,
    startSource: {
      materialId: 31, sectionId: 501, filename: '4주차_연결리스트.pdf', contentType: 'application/pdf',
      locator: 'p.12~14', page: 12, state: 'AVAILABLE', task: '삽입 함수 구현',
    },
    guidanceState: 'NOT_YET', guidance: null, startHelp: null, records: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  planAPI.itemDetail.mockResolvedValue({ available: false, canGenerate: true, steps: [], sections: [] });
  planAPI.createItemDetail.mockResolvedValue({
    detailId: 9, available: true, stale: false, steps: [{ text: '예제 4-2를 연다', sectionIds: [] }], sections: [],
  });
});

describe('학습 실행 작업 공간', () => {
  it('목표·첫 행동·시작 자료·완료 기준이 먼저 보이고, 여는 것만으로 안내를 만들지 않는다', async () => {
    executionItemAPI.workspace.mockResolvedValue(workspace());
    render(<ItemWorkspace executionItemId={501} onClose={() => {}} />);

    expect(await screen.findByRole('heading', { name: '연결 리스트 · 삽입 함수 작성' })).toBeInTheDocument();
    expect(screen.getByText('예제 4-2를 따라 치고 조건만 바꿔 실행')).toBeInTheDocument();
    expect(screen.getByText('4주차_연결리스트.pdf · p.12~14')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /p\.12 열기/ })).toBeInTheDocument();
    expect(screen.getByText('빈 리스트·중간·끝 삽입 3개 통과')).toBeInTheDocument();
    expect(planAPI.itemDetail).not.toHaveBeenCalled();
    expect(planAPI.createItemDetail).not.toHaveBeenCalled();
    expect(executionItemAPI.requestStartHelp).not.toHaveBeenCalled();
  });

  it('단계별 안내는 펼칠 때 같은 실행 항목으로 가져온다', async () => {
    executionItemAPI.workspace.mockResolvedValue(workspace());
    render(<ItemWorkspace executionItemId={501} onClose={() => {}} />);
    await screen.findByRole('heading', { name: '연결 리스트 · 삽입 함수 작성' });

    await userEvent.click(screen.getByRole('button', { name: /단계별 안내/ }));

    expect(await screen.findByText('예제 4-2를 연다')).toBeInTheDocument();
    expect(planAPI.itemDetail).toHaveBeenCalledWith(501);
  });

  it('"어디서 시작할지 모르겠어요"는 첫 행동을 구체화하고 범위는 그대로라고 말한다', async () => {
    executionItemAPI.workspace.mockResolvedValue(workspace());
    executionItemAPI.requestStartHelp.mockResolvedValue({
      helpId: 1, requestKind: 'WHERE_TO_START', firstAction: 'p.12의 그림 4-3을 보고 빈 리스트 삽입만 먼저 손으로 그린다',
      starter: { title: '5분 워밍업', minutes: 5, steps: ['노드 두 개를 그린다', 'head를 옮긴다'] },
      where: '4주차_연결리스트.pdf p.12 그림 4-3', scopeChangeRequested: false, grounded: true, stale: false,
    });
    render(<ItemWorkspace executionItemId={501} onClose={() => {}} />);
    await screen.findByRole('heading', { name: '연결 리스트 · 삽입 함수 작성' });

    await userEvent.click(screen.getByRole('button', { name: /시작 도움/ }));
    expect(screen.getByText(/항목의 범위·시간은 바뀌지 않아요/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('어디가 막막한지 (선택)'), 'head가 헷갈려요');
    await userEvent.click(screen.getByRole('button', { name: /어디서 시작할지 모르겠어요/ }));

    await waitFor(() => expect(executionItemAPI.requestStartHelp).toHaveBeenCalledWith(501, 'WHERE_TO_START', 'head가 헷갈려요'));
    // 첫 행동 칸이 도움으로 바뀌고 "시작 도움"이라고 표시된다.
    const core = screen.getAllByText('첫 행동').find((el) => el.tagName === 'DT').closest('div');
    expect(within(core).getByText(/빈 리스트 삽입만 먼저 손으로 그린다/)).toBeInTheDocument();
    expect(within(core).getByText('시작 도움')).toBeInTheDocument();
    expect(screen.getByText('노드 두 개를 그린다')).toBeInTheDocument();
  });

  it('도움받아 한 기록이 있으면 고칠 수 있고, 조정안 상담으로 갈 수 있다 — 계획은 저절로 바뀌지 않는다', async () => {
    const onAskAi = vi.fn();
    executionItemAPI.workspace.mockResolvedValue(workspace({
      records: [{
        executionRecordId: 91, executionItemId: 501, outcome: 'PARTIAL', completionPercent: 50, actualMinutes: 30,
        supportLevel: 'GUIDED', stuckStep: '직접 작성', recordedAt: '2026-09-29T10:00:00',
      }],
    }));
    executionItemAPI.updateRecordReflection.mockResolvedValue({});
    render(<ItemWorkspace executionItemId={501} onClose={() => {}} onAskAi={onAskAi} />);
    await screen.findByRole('heading', { name: '연결 리스트 · 삽입 함수 작성' });

    await userEvent.click(screen.getByRole('button', { name: /지난 기록 1건/ }));
    expect(screen.getByText(/설명·예제를 보고 했어/)).toBeInTheDocument();
    expect(screen.getByText(/막힌 단계: 직접 작성/)).toBeInTheDocument();
    expect(screen.getByText(/지금 계획은 저절로 바뀌지 않아요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '조정안 상담하기' }));
    expect(onAskAi).toHaveBeenCalledWith(expect.stringContaining('과목 전체를 다시 짜지는 말아 줘'), expect.anything());

    await userEvent.click(screen.getByRole('button', { name: '고치기' }));
    await userEvent.click(screen.getByRole('button', { name: '혼자 해냈어' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(executionItemAPI.updateRecordReflection).toHaveBeenCalledWith(91,
      expect.objectContaining({ supportLevel: 'SOLO', stuckStep: '직접 작성' })));
  });

  it('직접 만든 항목은 없는 안내를 지어내지 않고 그렇다고 말한다', async () => {
    executionItemAPI.workspace.mockResolvedValue(workspace({
      proposalItemId: null, startSource: null, guidanceState: 'NO_ORIGIN', doneCriteria: null,
      item: { ...ITEM, description: null },
    }));
    render(<ItemWorkspace executionItemId={501} onClose={() => {}} />);
    await screen.findByRole('heading', { name: '연결 리스트 · 삽입 함수 작성' });

    expect(screen.getByText('직접 만든 항목이라 연결된 자료가 없어요.')).toBeInTheDocument();
    expect(screen.getByText(/완료 기준이 적혀 있지 않아요/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /단계별 안내/ }));
    expect(screen.getByText(/자료를 근거로 한 단계 안내가 없어요/)).toBeInTheDocument();
    expect(planAPI.itemDetail).not.toHaveBeenCalled();
  });
});
