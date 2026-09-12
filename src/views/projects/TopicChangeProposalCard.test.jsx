import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopicChangeProposalCard from './TopicChangeProposalCard.jsx';
import { topicChangeProposalAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  topicChangeProposalAPI: { apply: vi.fn(), dismiss: vi.fn() },
}));

const base = {
  proposalId: 9, courseId: 5, materialId: 7, materialFilename: '연결리스트_실습.pdf', status: 'PROPOSED', stale: false,
  topicTitles: { 1: '연결 리스트', 2: '스택', 3: '큐' },
  sections: [{ sectionId: 10, title: '연습문제 2', locator: 'p.12', roles: ['EXERCISE'] }],
};

describe('자료 정리 변경안 카드', () => {
  beforeEach(() => vi.clearAllMocks());

  it('연결·추가만 있으면 한 줄 요약으로 접혀 있고 세부는 펼쳐야 보인다', async () => {
    render(<TopicChangeProposalCard proposal={{
      ...base,
      summary: { link: 1, add: 1, rename: 0, move: 0, merge: 0, split: 0, structural: false },
      ops: [
        { op: 'LINK', topicId: 1, sectionIds: [10], role: 'EXERCISE' },
        { op: 'ADD', tempId: 'n1', parentTopicId: 1, title: '원형 연결 리스트', sourceType: 'SOURCE', sectionIds: [] },
      ],
    }} />);

    expect(screen.getByText('기존 내용에 자료 1곳 연결 · 새 항목 1개 제안')).toBeInTheDocument();
    expect(screen.queryByText(/「연결 리스트」에 연습문제 2/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /연결리스트_실습.pdf/ }));
    expect(screen.getByText(/「연결 리스트」에 연습문제 2 \(p.12\) 연결/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('원형 연결 리스트')).toBeInTheDocument();
  });

  it('병합·분할·이동은 접힌 상태에서도 요약 아래에 드러난다', () => {
    render(<TopicChangeProposalCard proposal={{
      ...base,
      summary: { link: 0, add: 0, rename: 0, move: 0, merge: 1, split: 0, structural: true },
      ops: [{ op: 'MERGE', survivingTopicId: 2, absorbedTopicIds: [3], reason: '같은 범위' }],
    }} />);

    expect(screen.getByText(/병합 1건/)).toBeInTheDocument();
    expect(screen.getByText(/「큐」을\(를\) 「스택」에 합침/)).toBeInTheDocument();
    expect(screen.getByText(/기록은 복제하지 않고/)).toBeInTheDocument();
  });

  it('체크를 푼 작업은 적용 요청에서 빠지고, 고친 제목은 함께 실린다', async () => {
    topicChangeProposalAPI.apply.mockResolvedValue({ ...base, status: 'APPLIED' });
    const onResolved = vi.fn();
    render(<TopicChangeProposalCard onResolved={onResolved} proposal={{
      ...base,
      summary: { link: 1, add: 1, rename: 0, move: 0, merge: 0, split: 0, structural: false },
      ops: [
        { op: 'LINK', topicId: 1, sectionIds: [10], role: 'EXERCISE' },
        { op: 'ADD', tempId: 'n1', parentTopicId: 1, title: '원형 연결 리스트', sourceType: 'SOURCE', sectionIds: [] },
      ],
    }} />);

    await userEvent.click(screen.getByRole('button', { name: /연결리스트_실습.pdf/ }));
    const checks = screen.getAllByRole('checkbox');
    await userEvent.click(checks[0]); // LINK 제외
    const title = screen.getByDisplayValue('원형 연결 리스트');
    await userEvent.clear(title);
    await userEvent.type(title, '원형 연결 리스트(순회)');
    await userEvent.click(screen.getByRole('button', { name: '1개 적용' }));

    expect(topicChangeProposalAPI.apply).toHaveBeenCalledWith(9, {
      selectedOpIndexes: [1], titleOverrides: { 1: '원형 연결 리스트(순회)' },
    });
    expect(onResolved).toHaveBeenCalled();
  });

  it('구조가 그 사이 바뀐 변경안은 적용 버튼이 막히고 이유가 글로 보인다', () => {
    render(<TopicChangeProposalCard proposal={{
      ...base, stale: true,
      summary: { link: 1, add: 0, rename: 0, move: 0, merge: 0, split: 0, structural: false },
      ops: [{ op: 'LINK', topicId: 1, sectionIds: [10] }],
    }} />);
    expect(screen.getByRole('button', { name: '적용' })).toBeDisabled();
    expect(screen.getByText(/학습 구조가 바뀌었어요/)).toBeInTheDocument();
  });

  it('서버가 409(구조 변경)로 거절하면 그 이유를 말하고 아무것도 적용된 것처럼 보이지 않는다', async () => {
    topicChangeProposalAPI.apply.mockRejectedValue(Object.assign(new Error('conflict'), { code: 'E409_017' }));
    const onResolved = vi.fn();
    render(<TopicChangeProposalCard onResolved={onResolved} proposal={{
      ...base,
      summary: { link: 1, add: 0, rename: 0, move: 0, merge: 0, split: 0, structural: false },
      ops: [{ op: 'LINK', topicId: 1, sectionIds: [10] }],
    }} />);
    await userEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(await screen.findByText(/학습 구조가 바뀌었어요/)).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
