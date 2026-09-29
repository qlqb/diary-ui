import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/api.js', () => ({
  learningMapAPI: { get: vi.fn() },
  selfCheckAPI: { submit: vi.fn() },
  topicAPI: { getTree: vi.fn(), updateProgress: vi.fn(), updateUserMark: vi.fn() },
  projectTidyAPI: { get: vi.fn() },
  materialAPI: { listByCourse: vi.fn() },
  materialAnalysisStatusAPI: { overview: vi.fn(), retry: vi.fn() },
  materialStoreAPI: { file: vi.fn() },
  materialWeekAPI: { review: vi.fn(), place: vi.fn(), applySuggestions: vi.fn() },
}));

import ProjectLearningMap from './ProjectLearningMap.jsx';
import {
  learningMapAPI, materialAPI, materialAnalysisStatusAPI, materialWeekAPI, projectTidyAPI, selfCheckAPI, topicAPI,
} from '../../api/api.js';

const leaf = (topicId, title, extra = {}) => ({
  topicId, parentTopicId: null, title, progressStatus: 'NOT_STARTED', userMark: null, selfCheck: null,
  materials: [], plannedItems: 0, doneItems: 0, children: [], ...extra,
});

function mapResponse(overrides = {}) {
  return {
    courseId: 7,
    title: '자료구조',
    treeVersion: 3,
    state: { materials: 2, analysisPending: 0, analysisFailed: 0, linkWaiting: 0, openProposals: 0, topics: 5, hasRecords: true },
    topics: [
      leaf(1, '연결 리스트', {
        progressStatus: 'IN_PROGRESS',
        selfCheck: 'UNSURE',
        plannedItems: 3,
        doneItems: 1,
        materials: [
          { materialId: 11, filename: 'ch03_list.pdf', sectionId: 101, locator: 'p.3-9' },
          { materialId: 12, filename: 'week2_slides.pptx', sectionId: 201, locator: '슬라이드 4-12' },
        ],
        children: [
          leaf(2, '단순 연결 리스트', { children: [leaf(4, '노드 삽입과 삭제')] }),
          leaf(3, '원형 연결 리스트'),
        ],
      }),
      leaf(5, '스택과 큐'),
    ],
    proposed: [],
    unlinked: [],
    weeks: [],
    ...overrides,
  };
}

function notFound() {
  const err = new Error('요청 실패: 404');
  err.status = 404;
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  learningMapAPI.get.mockResolvedValue(mapResponse());
  topicAPI.getTree.mockResolvedValue([]);
  projectTidyAPI.get.mockResolvedValue(null);
  materialAPI.listByCourse.mockResolvedValue([]);
  materialAnalysisStatusAPI.overview.mockResolvedValue({ materials: [] });
});

describe('ProjectLearningMap - 주제가 뿌리인 트리', () => {
  it('자료 파일이 아니라 주제가 뿌리이고, 한 주제에 여러 자료가 위치와 함께 붙는다', async () => {
    render(<ProjectLearningMap courseId={7} />);

    const title = await screen.findByText('연결 리스트');
    const row = title.closest('.lm-row');
    const materials = within(row).getByRole('list', { name: '연결 리스트에 연결된 자료' });
    expect(within(materials).getByText('ch03_list.pdf')).toBeInTheDocument();
    expect(within(materials).getByText('p.3-9')).toBeInTheDocument();
    expect(within(materials).getByText('week2_slides.pptx')).toBeInTheDocument();
    // 뿌리 목록에 파일 이름으로 된 항목은 없다.
    expect(screen.queryByRole('button', { name: /ch03_list\.pdf/ })).not.toBeInTheDocument();
  });

  it('계획·완료 개수, 자기평가, 진행 상태를 글자로 보여 준다', async () => {
    render(<ProjectLearningMap courseId={7} />);
    const row = (await screen.findByText('연결 리스트')).closest('.lm-row');
    expect(within(row).getByText('계획한 일 3개 · 끝낸 일 1개')).toBeInTheDocument();
    expect(within(row).getByText('자기평가: 애매해')).toBeInTheDocument();
    expect(within(row).getByText('학습 중')).toBeInTheDocument();
  });

  it('처음에는 첫 단계만 펼친다 — 더 깊은 항목은 펼치기 전에는 그리지 않는다', async () => {
    render(<ProjectLearningMap courseId={7} />);
    expect(await screen.findByText('단순 연결 리스트')).toBeInTheDocument();
    expect(screen.queryByText('노드 삽입과 삭제')).not.toBeInTheDocument();
  });

  it('모두 펼치기 / 모두 접기', async () => {
    const user = userEvent.setup();
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');

    await user.click(screen.getByRole('button', { name: '모두 펼치기' }));
    expect(screen.getByText('노드 삽입과 삭제')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '모두 접기' }));
    expect(screen.queryByText('단순 연결 리스트')).not.toBeInTheDocument();
    expect(screen.getByText('연결 리스트')).toBeInTheDocument();
  });

  it('검색하면 맞는 항목이 있는 자리까지 조상을 펼치고, 맞은 글자를 강조하고, 나머지는 거른다', async () => {
    const user = userEvent.setup();
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');

    await user.type(screen.getByLabelText('학습 지도에서 찾기'), '삽입');

    const mark = await screen.findByText('삽입');
    expect(mark.tagName).toBe('MARK');
    expect(screen.getByText('단순 연결 리스트')).toBeInTheDocument();
    expect(screen.queryByText('스택과 큐')).not.toBeInTheDocument();
    expect(screen.queryByText('원형 연결 리스트')).not.toBeInTheDocument();
    expect(screen.getByText(/맞는 항목 1개/)).toBeInTheDocument();
  });

  it('선택한 항목으로 이동: 접혀 있어도 조상을 펼치고 그 줄에 포커스를 준다', async () => {
    const user = userEvent.setup();
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');

    await user.click(screen.getByRole('button', { name: /^단순 연결 리스트$/ }));
    await user.click(screen.getByRole('button', { name: '모두 접기' }));
    expect(screen.queryByRole('button', { name: /^단순 연결 리스트$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '선택한 항목으로 이동' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /^단순 연결 리스트$/ })).toHaveFocus());
  });
});

describe('ProjectLearningMap - 주차별 보기', () => {
  it('weeks가 비면 주차 탭을 아예 그리지 않는다', async () => {
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');
    expect(screen.queryByRole('tab', { name: '주차별' })).not.toBeInTheDocument();
  });

  it('확인된 자료의 주차로 같은 항목을 다시 묶는다 — 한 항목이 두 주차에 나올 수 있다', async () => {
    const user = userEvent.setup();
    learningMapAPI.get.mockResolvedValue(mapResponse({
      weeks: [
        { label: '2주차', basis: 'CONFIRMED_MATERIAL', confirmed: true, weekNo: 2, materialIds: [12], sectionIds: [201],
          topicIds: [1], materials: [{ materialId: 12, filename: 'week2_slides.pptx' }] },
        { label: '3주차', basis: 'CONFIRMED_MATERIAL', confirmed: true, weekNo: 3, materialIds: [11], sectionIds: [],
          topicIds: [1, 5], materials: [{ materialId: 11, filename: 'ch03_list.pdf' }] },
      ],
      weekReview: { needsReview: 0, placed: 2, courseWide: [{ materialId: 13, filename: '자료구조.pdf' }] },
    }));
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');

    await user.click(screen.getByRole('tab', { name: '주차별' }));

    const second = screen.getByRole('region', { name: '2주차' });
    expect(within(second).getByText('연결 리스트')).toBeInTheDocument();
    expect(within(second).getByText('자료: week2_slides.pptx')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '3주차' })).getByText('연결 리스트')).toBeInTheDocument();
    // 확인된 주차에는 "확인 전" 안내가 붙지 않는다.
    expect(screen.queryByText(/확인 전 주차/)).not.toBeInTheDocument();
    // 강의계획서 같은 전체 참고자료는 주차 칸이 아니라 따로 적힌다.
    expect(screen.getByText(/전체 참고자료: 자료구조\.pdf/)).toBeInTheDocument();
  });

  it('상위 항목이 같은 주차에 있으면 하위 항목을 맨 위에 한 번 더 놓지 않는다', async () => {
    const user = userEvent.setup();
    learningMapAPI.get.mockResolvedValue(mapResponse({
      weeks: [{ label: '3주차', basis: 'CONFIRMED_MATERIAL', confirmed: true, weekNo: 3, materialIds: [11],
        sectionIds: [], topicIds: [1, 2], materials: [] }],
      weekReview: { needsReview: 0, placed: 1, courseWide: [] },
    }));
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');
    await user.click(screen.getByRole('tab', { name: '주차별' }));

    const week = screen.getByRole('region', { name: '3주차' });
    const topLevel = within(week).getAllByRole('list')[0];
    expect(within(topLevel).getAllByText('연결 리스트')).toHaveLength(1);
    // 「단순 연결 리스트」는 「연결 리스트」 아래(펼치면)에만 있고 맨 위 줄에는 없다.
    expect([...topLevel.children].map((li) => li.querySelector('.lm-title')?.textContent)).toEqual(['연결 리스트']);
  });
});

describe('ProjectLearningMap - 자료 주차 확인', () => {
  it('확인 전 자료가 있으면 개수와 확인하는 길을 보이고, 추천은 지도에 넣지 않는다', async () => {
    const user = userEvent.setup();
    learningMapAPI.get.mockResolvedValue(mapResponse({ weekReview: { needsReview: 3, placed: 0, courseWide: [] } }));
    materialWeekAPI.review.mockResolvedValue({
      courseId: 7, courseTitle: '자료구조', weekCount: 15, needsReview: 3,
      items: [{ materialId: 11, filename: 'ch03_list.pdf', materialType: 'PROFESSOR_SLIDE', analysisState: 'DONE',
        assignment: null, suggestionDiffers: false,
        suggestion: { placement: 'WEEK', week: 3, confidence: 'HIGH', bulkApplicable: true,
          options: [{ placement: 'WEEK', week: 3 }], evidence: [{ kind: 'FILENAME_WEEK', detail: '파일명: 3주차' }] } }],
    });
    render(<ProjectLearningMap courseId={7} />);

    expect(await screen.findByText('자료 주차 확인 필요 3개')).toBeInTheDocument();
    // 추천이 있어도 주차 탭은 없다 — 확인된 주차가 없으니까.
    expect(screen.queryByRole('tab', { name: '주차별' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '자료 주차 확인하기' }));
    const dialog = await screen.findByRole('dialog', { name: '자료 주차 확인' });
    expect(within(dialog).getByText('3주차 · AI 추천')).toBeInTheDocument();
  });
});

describe('ProjectLearningMap - 자동 분석 제안(승인 전)', () => {
  const proposed = [{
    proposalId: 90,
    materialId: 13,
    filename: 'week5_tree.pdf',
    summary: { add: 1, merge: 1 },
    nodes: [
      { tempId: 't1', title: '이중 연결 리스트', parentTempId: null, parentTopicId: 1, op: 'ADD',
        sections: [{ sectionId: 301, title: '4.3 Doubly Linked', locator: 'p.21-25' }] },
      { tempId: 't2', title: '「큐」이(가) 이 항목으로 합쳐짐', parentTempId: null, parentTopicId: 5, op: 'MERGE', sections: [] },
    ],
  }];

  it('기존 트리 안 붙을 자리에 글자 라벨과 함께 읽기 전용으로 보인다 — 진도 조작이 없다', async () => {
    const user = userEvent.setup();
    const onReviewProposals = vi.fn();
    learningMapAPI.get.mockResolvedValue(mapResponse({ proposed }));
    render(<ProjectLearningMap courseId={7} onMarkTopic={vi.fn()} onReviewProposals={onReviewProposals} />);

    const node = (await screen.findByText('이중 연결 리스트')).closest('li');
    // 「연결 리스트」 가지 안에 있다.
    expect(node.closest('.lm-node:not(.lm-proposed)')).toContainElement(screen.getByText('연결 리스트'));
    expect(within(node).getByText('자동 분석 제안(승인 전)')).toBeInTheDocument();
    expect(within(node).getByText('새 항목')).toBeInTheDocument();
    expect(within(node).getByText('4.3 Doubly Linked (p.21-25)')).toBeInTheDocument();
    // 읽기 전용: 표식 버튼도, 진행 라벨도 없다.
    expect(within(node).queryByRole('button', { name: '이미 알아요' })).not.toBeInTheDocument();
    expect(within(node).queryByText('아직 안 함')).not.toBeInTheDocument();

    await user.click(within(node).getByRole('button', { name: '변경안에서 검토·적용하기' }));
    expect(onReviewProposals).toHaveBeenCalledWith(90);
  });

  it('병합·분할 미리보기는 완료가 자동으로 옮겨지지 않고 주차 이동이 완료를 취소하지 않는다고 말한다', async () => {
    const user = userEvent.setup();
    learningMapAPI.get.mockResolvedValue(mapResponse({ proposed }));
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('스택과 큐');

    expect(screen.getByText(/완료 표시는 자동으로 옮겨지지 않아요/)).toBeInTheDocument();
    expect(screen.getByText(/주차를 옮겨도 이미 완료한 기록은 취소되지 않아요/)).toBeInTheDocument();

    // 가지를 접어도 제안이 있다는 표시는 글자로 남는다.
    await user.click(screen.getByRole('button', { name: '스택과 큐 접기' }));
    const row = screen.getByText('스택과 큐').closest('.lm-row');
    expect(within(row).getByText('승인 전 제안 1개')).toBeInTheDocument();
  });
});

describe('ProjectLearningMap - 다섯 상태와 상담 입구', () => {
  const empty = { topics: [], proposed: [], unlinked: [], weeks: [] };
  const state = (patch) => ({
    materials: 1, analysisPending: 0, analysisFailed: 0, linkWaiting: 0, openProposals: 0, topics: 0, hasRecords: false, ...patch,
  });

  it('어떤 상태든 지도 정리는 선택이라고 말하고 상담으로 가는 버튼이 있다', async () => {
    const user = userEvent.setup();
    const onOpenConsult = vi.fn();
    learningMapAPI.get.mockResolvedValue(mapResponse({ ...empty, state: state({ materials: 0 }) }));
    render(<ProjectLearningMap courseId={7} onOpenConsult={onOpenConsult} />);

    expect(await screen.findByText(/지도를 정리하지 않아도 상담과 계획은 바로 할 수 있어요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '이 프로젝트로 상담하기' }));
    expect(onOpenConsult).toHaveBeenCalledWith(7);
  });

  it('자료 없음', async () => {
    const onOpenMaterials = vi.fn();
    learningMapAPI.get.mockResolvedValue(mapResponse({ ...empty, state: state({ materials: 0 }) }));
    render(<ProjectLearningMap courseId={7} onOpenMaterials={onOpenMaterials} />);
    expect(await screen.findByText('아직 올린 자료가 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '자료 올리기' })).toBeInTheDocument();
  });

  it('구조 제안 대기', async () => {
    learningMapAPI.get.mockResolvedValue(mapResponse({ ...empty, state: state({ openProposals: 2 }) }));
    render(<ProjectLearningMap courseId={7} onReviewProposals={vi.fn()} />);
    expect(await screen.findByText('승인을 기다리는 구조 제안이 있어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제안 검토하기' })).toBeInTheDocument();
  });

  it('분석 대기', async () => {
    learningMapAPI.get.mockResolvedValue(mapResponse({ ...empty, state: state({ analysisPending: 3 }) }));
    render(<ProjectLearningMap courseId={7} />);
    expect(await screen.findByText('자료 3개를 분석하려고 기다리는 중이에요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지금 다시 확인' })).toBeInTheDocument();
  });

  it('분석 실패 — 다시 시도를 누르면 그 자료의 분석을 다시 건다', async () => {
    const user = userEvent.setup();
    materialAnalysisStatusAPI.retry.mockResolvedValue({});
    learningMapAPI.get.mockResolvedValue(mapResponse({
      ...empty,
      state: state({ analysisFailed: 1 }),
      unlinked: [{ materialId: 31, filename: 'broken.pdf', analysisState: 'FAILED', sections: [] }],
    }));
    render(<ProjectLearningMap courseId={7} />);
    expect(await screen.findByText('분석하지 못한 자료가 1개 있어요')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '분석 다시 시도' }));
    await waitFor(() => expect(materialAnalysisStatusAPI.retry).toHaveBeenCalledWith(31));
  });

  it('학습 기록 없음 — 트리는 있고 기록만 없다', async () => {
    learningMapAPI.get.mockResolvedValue(mapResponse({ state: state({ topics: 5, hasRecords: false }) }));
    render(<ProjectLearningMap courseId={7} />);
    expect(await screen.findByText('아직 학습 기록이 없어요')).toBeInTheDocument();
    expect(screen.getByText('연결 리스트')).toBeInTheDocument();
  });

  it('다섯 상태의 문구는 서로 다르다', async () => {
    learningMapAPI.get.mockResolvedValue(mapResponse({
      state: state({ topics: 5, openProposals: 1, analysisPending: 1, analysisFailed: 1, hasRecords: false }),
    }));
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');
    const titles = [...document.querySelectorAll('.lm-state-title')].map((el) => el.textContent);
    expect(titles).toHaveLength(4);
    expect(new Set(titles).size).toBe(4);
  });
});

describe('ProjectLearningMap - 미연결 자료', () => {
  it('주제에 연결되지 않은 자료를 구간과 함께 따로 모은다', async () => {
    const user = userEvent.setup();
    learningMapAPI.get.mockResolvedValue(mapResponse({
      unlinked: [{
        materialId: 40, filename: 'syllabus.pdf', analysisState: 'DONE',
        sections: [{ sectionId: 401, title: '평가 방법', locator: 'p.2', roles: ['ADMIN'] }],
      }],
    }));
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');

    await user.click(screen.getByRole('button', { name: /아직 주제에 연결되지 않은 자료/ }));
    expect(screen.getByText('syllabus.pdf')).toBeInTheDocument();
    expect(screen.getByText('평가 방법')).toBeInTheDocument();
    expect(screen.getByText('운영 안내')).toBeInTheDocument();
  });
});

describe('ProjectLearningMap - 서버가 아직 learning-map을 모를 때(404)', () => {
  it('기존 트리·변경안·자료 목록으로 같은 화면을 만든다', async () => {
    learningMapAPI.get.mockRejectedValue(notFound());
    topicAPI.getTree.mockResolvedValue([
      { topicId: 1, title: '연결 리스트', progressStatus: 'NOT_STARTED', children: [
        { topicId: 2, title: '단순 연결 리스트', progressStatus: 'NOT_STARTED', children: [] },
      ] },
    ]);
    // 검토 중인 정리안은 프로젝트당 하나다. 지도는 그것을 "승인 전" 미리보기로 겹쳐 보여준다.
    projectTidyAPI.get.mockResolvedValue({
      proposalId: 5,
      status: 'PROPOSED',
      summary: { headline: '새 항목 1개' },
      scope: { reviewed: [{ materialId: 21, filename: 'week3.pdf' }], excluded: [] },
      groups: [{ key: 't1', kind: 'EXISTING', topicId: 1, title: '연결 리스트', changeIds: ['c1'] }],
      changes: [{
        changeId: 'c1', op: 'ADD', label: '새 항목', title: '원형 연결 리스트',
        text: '「연결 리스트」 아래에 「원형 연결 리스트」을(를) 새로 만들어요',
        sections: [{ sectionId: 9, materialId: 21, title: '3.4 원형 리스트', locator: 'p.30' }],
      }],
    });
    materialAPI.listByCourse.mockResolvedValue([{ materialId: 21, originalFilename: 'week3.pdf' }]);
    materialAnalysisStatusAPI.overview.mockResolvedValue({ materials: [{ materialId: 21, state: 'DONE' }] });

    render(<ProjectLearningMap courseId={7} />);

    expect(await screen.findByText('단순 연결 리스트')).toBeInTheDocument();
    const proposedNode = screen.getByText('원형 연결 리스트').closest('li');
    expect(within(proposedNode).getByText('자동 분석 제안(승인 전)')).toBeInTheDocument();
    expect(within(proposedNode).getByText('3.4 원형 리스트 (p.30)')).toBeInTheDocument();
    expect(screen.getByText('승인을 기다리는 구조 제안이 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '주차별' })).not.toBeInTheDocument();
    expect(topicAPI.getTree).toHaveBeenCalledWith(7);
  });

  it('404가 아닌 오류는 숨기지 않는다', async () => {
    learningMapAPI.get.mockRejectedValue(Object.assign(new Error('서버 오류'), { status: 500 }));
    render(<ProjectLearningMap courseId={7} />);
    expect(await screen.findByText(/서버 오류/)).toBeInTheDocument();
    expect(topicAPI.getTree).not.toHaveBeenCalled();
  });
});

describe('ProjectLearningMap - 점검 활동(선택)', () => {
  it('시험이 아니라 자기평가라고 말하고, 답한 항목만 보낸다', async () => {
    const user = userEvent.setup();
    selfCheckAPI.submit.mockResolvedValue(null);
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');

    await user.click(screen.getByRole('button', { name: '점검 활동 해보기 (선택)' }));
    const panel = screen.getByRole('region', { name: '점검 활동' });
    expect(within(panel).getByText(/시험이 아니에요/)).toBeInTheDocument();
    expect(within(panel).getByText(/완료로 처리되지 않고/)).toBeInTheDocument();

    const first = within(panel).getByRole('group', { name: '노드 삽입과 삭제' });
    await user.click(within(first).getByRole('radio', { name: '애매해' }));
    await user.type(within(first).getByLabelText('노드 삽입과 삭제 메모 (선택)'), '삭제가 헷갈려');
    await user.click(within(panel).getByRole('button', { name: '원형 연결 리스트 건너뛰기' }));

    await user.click(within(panel).getByRole('button', { name: '1개 자기평가 저장' }));

    await waitFor(() => expect(selfCheckAPI.submit).toHaveBeenCalledWith(7, [{
      key: 'topic-4', label: '노드 삽입과 삭제', topicId: 4, sectionId: null, level: 'UNSURE', note: '삭제가 헷갈려',
    }]));
    expect(await screen.findByText(/자기평가로 저장했어요/)).toBeInTheDocument();
  });

  it('이번엔 건너뛰기로 닫을 수 있다', async () => {
    const user = userEvent.setup();
    render(<ProjectLearningMap courseId={7} />);
    await screen.findByText('연결 리스트');
    await user.click(screen.getByRole('button', { name: '점검 활동 해보기 (선택)' }));
    await user.click(screen.getByRole('button', { name: '이번엔 건너뛰기' }));
    expect(screen.queryByRole('region', { name: '점검 활동' })).not.toBeInTheDocument();
    expect(selfCheckAPI.submit).not.toHaveBeenCalled();
  });
});
