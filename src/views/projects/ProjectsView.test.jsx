import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectsView from './ProjectsView.jsx';
import { courseAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  courseAPI: { list: vi.fn(), create: vi.fn(), restore: vi.fn() },
}));

const ACTIVE = [{ courseId: 6, title: '자료구조', groupLabel: null, topicCount: 37, learnedTopicCount: 0 }];
const ARCHIVED = [{ courseId: 2, title: '자료구조', status: 'ARCHIVED', topicCount: 57, learnedTopicCount: 0 }];

describe('프로젝트 목록의 보관함', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    courseAPI.list.mockResolvedValue(ARCHIVED);
    courseAPI.restore.mockResolvedValue(undefined);
  });

  it('보관한 것이 없으면 보관함 영역 자체를 그리지 않는다', async () => {
    courseAPI.list.mockResolvedValue([]);
    render(<ProjectsView projects={ACTIVE} loading={false} error={null} onReload={vi.fn()} onOpen={vi.fn()} />);

    await screen.findByText('자료구조');
    expect(screen.queryByText('보관된 프로젝트')).not.toBeInTheDocument();
  });

  it('다시 꺼내면 복원 API를 부르고 목록을 새로 읽는다', async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    render(<ProjectsView projects={ACTIVE} loading={false} error={null} onReload={onReload} onOpen={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: /보관된 프로젝트/ }));
    await user.click(screen.getByRole('button', { name: '다시 꺼내기' }));

    // 자료 연결을 되살리는 별도 복구 호출은 없다 — 서버가 status만 되돌리면 저절로 돌아온다.
    expect(courseAPI.restore).toHaveBeenCalledWith(2);
    expect(onReload).toHaveBeenCalled();
  });
});
