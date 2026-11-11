import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StructureEditor from './StructureEditor.jsx';
import { structureAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  structureAPI: { manual: vi.fn() },
}));

/**
 * 직접 조정은 모으기만 한다 — 보내기 전에는 아무것도 바뀌지 않고, 보내도 정리안(검토)에 더해질 뿐이다.
 * 교재 구조·실제 수업·범위를 다른 작업으로 만든다.
 */
const TOPICS = [
  { topicId: 1, parentTopicId: null, title: '3장 스택' },
  { topicId: 2, parentTopicId: null, title: '4장 큐' },
  { topicId: 3, parentTopicId: null, title: '5장 연결 리스트' },
];

beforeEach(() => vi.clearAllMocks());

describe('구조 직접 조정', () => {
  it('실제 수업 순서·범위 제외·위치 이동을 서로 다른 변경으로 모아 한 번에 보낸다', async () => {
    structureAPI.manual.mockResolvedValue({ added: 3 });
    const onSent = vi.fn();
    render(<StructureEditor courseId={9} topic={TOPICS[2]} topics={TOPICS} onSent={onSent} />);

    await userEvent.selectOptions(screen.getByLabelText('실제로 다룬 주차'), '2');
    await userEvent.selectOptions(screen.getByLabelText('바로 앞에 다룬 항목'), '0');
    await userEvent.click(screen.getByRole('button', { name: '기록' }));
    await userEvent.type(screen.getByLabelText('어느 시험·계획'), '중간고사');
    await userEvent.click(screen.getByRole('button', { name: '범위에서 빼기' }));
    await userEvent.click(screen.getByRole('button', { name: '위로' }));

    expect(screen.getByText('2주차에 다룸 · 가장 먼저 다룸')).toBeInTheDocument();
    expect(structureAPI.manual).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /검토로 보내기/ }));

    await waitFor(() => expect(structureAPI.manual).toHaveBeenCalledTimes(1));
    const [courseId, ops] = structureAPI.manual.mock.calls[0];
    expect(courseId).toBe(9);
    expect(ops).toEqual([
      expect.objectContaining({ op: 'CLASS', topicId: 3, week: 2, afterTopicId: 0 }),
      expect.objectContaining({ op: 'SCOPE_EXCLUDE', topicId: 3, label: '중간고사' }),
      // 한 칸 위: 4장(index 1) 앞 → 3장(index 0) 뒤
      expect.objectContaining({ op: 'MOVE', topicId: 3, parentTopicId: null, afterTopicId: 1 }),
    ]);
    expect(onSent).toHaveBeenCalled();
  });

  it('나누기는 제목이 둘 이상일 때만, 합치기는 다른 항목을 흡수한다', async () => {
    structureAPI.manual.mockResolvedValue({ added: 2 });
    render(<StructureEditor courseId={9} topic={TOPICS[0]} topics={TOPICS} />);

    const split = screen.getByRole('button', { name: '나누기' });
    await userEvent.type(screen.getByLabelText('나눌 하위 항목 제목(한 줄에 하나)'), '스택 개념');
    expect(split).toBeDisabled();
    await userEvent.type(screen.getByLabelText('나눌 하위 항목 제목(한 줄에 하나)'), '{enter}스택 구현');
    await userEvent.click(split);
    await userEvent.selectOptions(screen.getByLabelText('같은 내용인 항목'), '2');
    await userEvent.click(screen.getByRole('button', { name: '합치기' }));
    await userEvent.click(screen.getByRole('button', { name: /검토로 보내기/ }));

    const ops = structureAPI.manual.mock.calls[0][1];
    expect(ops[0]).toEqual(expect.objectContaining({ op: 'SPLIT', topicId: 1 }));
    expect(ops[0].children.map((c) => c.title)).toEqual(['스택 개념', '스택 구현']);
    expect(ops[1]).toEqual(expect.objectContaining({ op: 'MERGE', survivingTopicId: 1, absorbedTopicIds: [2] }));
  });
});
