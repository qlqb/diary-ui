/**
 * 프로젝트 화면에서 학습 지도로 들어가는 입구.
 *
 * 예전에는 맨 아래 접힌 블록이었다. 이제는 "작업 공간 / 학습 지도" 두 구역 중 하나이고,
 * 바깥에서 initialSection="map"으로 열어 달라고 할 수 있다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectWorkspace from './ProjectWorkspace.jsx';
import {
  courseAPI, courseNoteAPI, executionItemAPI, learningMapAPI, materialAPI, planAPI,
} from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  materialAnalysisStatusAPI: {
    overview: vi.fn().mockResolvedValue({ materials: [], paused: false, serviceAvailable: true }),
    retry: vi.fn(), section: vi.fn(), sections: vi.fn().mockResolvedValue([]), status: vi.fn(),
  },
  topicChangeProposalAPI: { listByCourse: vi.fn().mockResolvedValue([]), apply: vi.fn(), dismiss: vi.fn() },
  assignmentAPI: {
    listByCourse: vi.fn().mockResolvedValue([]), listOpen: vi.fn().mockResolvedValue([]),
    answer: vi.fn(), setDue: vi.fn(), setCompleted: vi.fn(), rename: vi.fn(), create: vi.fn(),
  },
  courseAPI: { get: vi.fn(), update: vi.fn(), archive: vi.fn() },
  courseNoteAPI: { list: vi.fn() },
  executionItemAPI: { getByCourse: vi.fn(), getByDateRange: vi.fn() },
  materialAPI: { upload: vi.fn(), listByCourse: vi.fn() },
  materialAnalysisAPI: { analyze: vi.fn(), dismiss: vi.fn(), listByMaterial: vi.fn() },
  materialStoreAPI: { list: vi.fn(), addLink: vi.fn(), removeLink: vi.fn(), updateLinkType: vi.fn() },
  topicAPI: { getTree: vi.fn().mockResolvedValue([]), updateUserMark: vi.fn(), updateProgress: vi.fn() },
  planAPI: { findCoveringDate: vi.fn() },
  learningMapAPI: { get: vi.fn() },
  selfCheckAPI: { submit: vi.fn() },
}));

const MAP = {
  courseId: 6, title: '자료구조', treeVersion: 1,
  state: { materials: 1, analysisPending: 0, analysisFailed: 0, linkWaiting: 0, openProposals: 0, topics: 1, hasRecords: true },
  topics: [{ topicId: 1, parentTopicId: null, title: '연결 리스트', progressStatus: 'NOT_STARTED', userMark: null,
    selfCheck: null, materials: [], plannedItems: 0, doneItems: 0, children: [] }],
  proposed: [], unlinked: [], weeks: [],
};

function renderWorkspace(props = {}) {
  return render(
    <ProjectWorkspace courseId={6} onBack={vi.fn()} onAsk={vi.fn()} draft={null} onPatchCard={vi.fn()}
      onToggleExclude={vi.fn()} onProjectsChanged={vi.fn()} {...props} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  planAPI.findCoveringDate.mockResolvedValue([]);
  executionItemAPI.getByDateRange.mockResolvedValue([]);
  executionItemAPI.getByCourse.mockResolvedValue([]);
  courseAPI.get.mockResolvedValue({ courseId: 6, title: '자료구조', status: 'ACTIVE' });
  materialAPI.listByCourse.mockResolvedValue([]);
  courseNoteAPI.list.mockResolvedValue([]);
  learningMapAPI.get.mockResolvedValue(MAP);
});

describe('프로젝트 화면의 학습 지도 입구', () => {
  it('기본은 작업 공간이고, "학습 지도" 탭으로 프로젝트 전체 지도를 연다', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const mapTab = await screen.findByRole('tab', { name: '학습 지도' });
    expect(mapTab).toHaveAttribute('aria-selected', 'false');
    expect(learningMapAPI.get).not.toHaveBeenCalled();

    await user.click(mapTab);

    expect(mapTab).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('연결 리스트')).toBeInTheDocument();
    expect(learningMapAPI.get).toHaveBeenCalledWith(6);
  });

  it('initialSection="map"이면 지도부터 보이고, 상담 버튼은 onOpenConsult(courseId)를 부른다', async () => {
    const user = userEvent.setup();
    const onOpenConsult = vi.fn();
    renderWorkspace({ initialSection: 'map', onOpenConsult });

    expect(await screen.findByText('연결 리스트')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '학습 지도' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: '이 프로젝트로 상담하기' }));
    expect(onOpenConsult).toHaveBeenCalledWith(6);
  });
});
