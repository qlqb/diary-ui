/**
 * 프로젝트 자료 정리 화면.
 *
 * 고정하는 것:
 *  - 정리는 누를 때만 시작된다. 쓸 수 있는 자료가 없으면 버튼이 열리지 않고 이유를 말한다.
 *  - 변경은 <영향을 받는 항목>으로 묶여 보인다. 파일별 카드가 아니다.
 *  - 체크를 풀면 딸린 변경도 함께 풀린다 — 반쪽 적용을 만들지 않는다.
 *  - 편집은 자동 저장되지만 트리는 바뀌지 않는다. 저장 실패를 삼키지 않는다.
 *  - 새 자료가 끝나도 지금 보는 안은 그대로다. 다시 만드는 것은 사용자가 누를 때다.
 *  - 트리가 바뀌었으면 적용을 막고 이유를 말한다(정리안을 숨기지 않는다).
 */
import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/api.js', () => ({
  materialStoreAPI: { file: vi.fn() },
  structureAPI: { request: vi.fn() },
  projectTidyAPI: {
    get: vi.fn(), request: vi.fn(), retry: vi.fn(), saveEdits: vi.fn(), apply: vi.fn(), dismiss: vi.fn(), history: vi.fn(),
  },
}));

import ProjectTidyPanel from './ProjectTidyPanel.jsx';
import { projectTidyAPI, structureAPI } from '../../api/api.js';
import { __resetAll } from '../../lib/tidyEditStore.js';

const change = (changeId, op, text, extra = {}) => ({
  changeId, op, label: op, text, reason: null, titleEditable: op === 'ADD' || op === 'RENAME',
  title: null, structural: ['MOVE', 'MERGE', 'SPLIT'].includes(op), dependsOn: [], caution: null,
  sections: [], ...extra,
});

function view(overrides = {}) {
  return {
    courseId: 6,
    proposalId: 11,
    status: 'PROPOSED',
    revision: 1,
    baseTreeVersion: 3,
    currentTreeVersion: 3,
    treeChanged: false,
    job: null,
    summary: { headline: '자료 연결 2곳 · 새 항목 1개', structural: false, total: 3 },
    groups: [
      { key: 't1', kind: 'EXISTING', topicId: 1, title: '스택', parentTitle: null, changeIds: ['c1'] },
      { key: 'nc2', kind: 'NEW', topicId: null, title: '원형 큐', parentTitle: null, changeIds: ['c2'] },
    ],
    changes: [
      change('c1', 'LINK', '「스택」에 강의슬라이드.pdf p.3, 교재.pdf p.30을(를) 연결해요', {
        sections: [
          { sectionId: 9, materialId: 21, materialFilename: '강의슬라이드.pdf', locator: 'p.3', title: '스택 정의' },
          { sectionId: 10, materialId: 22, materialFilename: '교재.pdf', locator: 'p.30', title: '3장 스택' },
        ],
      }),
      change('c2', 'ADD', '맨 위에 「원형 큐」을(를) 새로 만들어요', { title: '원형 큐' }),
    ],
    dependsOn: {},
    edits: {},
    editRevision: 0,
    scope: {
      courseId: 6, treeVersion: 3, topicCount: 5, treeLinesShown: 5,
      reviewed: [
        { materialId: 21, filename: '강의슬라이드.pdf', sectionCount: 4, reviewedCount: 4 },
        { materialId: 22, filename: '교재.pdf', sectionCount: 6, reviewedCount: 6 },
      ],
      excluded: [],
      truncated: false, sectionsTotal: 10, sectionsReviewed: 10,
    },
    newMaterialCount: 0,
    readyMaterialCount: 2,
    analyzingMaterialCount: 0,
    firstTime: false,
    legacyProposalCount: 0,
    ...overrides,
  };
}

const empty = (overrides = {}) => ({
  courseId: 6, proposalId: null, status: null, job: null, groups: [], changes: [], dependsOn: {},
  edits: {}, editRevision: 0, scope: null, readyMaterialCount: 0, analyzingMaterialCount: 0,
  newMaterialCount: 0, firstTime: true, legacyProposalCount: 0, ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  /*
    검토 편집은 모듈 수준(tidyEditStore)에 산다 — 화면을 옮겨도 저장이 이어지게 하려고
    일부러 그렇게 두었다. 그래서 테스트끼리도 상태가 넘어간다. 앞 테스트가 남긴 편집이
    다음 테스트의 판 번호를 흔들지 않게 여기서 비운다.
  */
  __resetAll();
});

describe('정리를 시작하기 전', () => {
  it('교재 목차로 만든 안은 목차 근거와 적용 시 기록할 교재를 말한다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({
      tocLabel: '웹 목차(예스24 · 10/4 조회 · 페이지에 실린 목차 전체)',
      recordsTextbook: '「New English Conversation Arts 1」 · 형설출판사 · ISBN 9788947288132 · 2026-01-30 발행',
    }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/교재 목차 근거: 웹 목차\(예스24/)).toBeInTheDocument();
    expect(screen.getByText(/수업 진도나 밀린 일로 보지 않아요/)).toBeInTheDocument();
    expect(screen.getByText(/적용하면 지금 교재로 「New English Conversation Arts 1」/)).toBeInTheDocument();
  });

  it('안을 만든 뒤 교재가 바뀌었으면 목차 변경은 적용하지 않는다고 말하고, 새 목차는 사용자가 반영한다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({ tocStale: true, newTocAvailable: true }));
    projectTidyAPI.request.mockResolvedValue(view());
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/교재나 교재 목차가 바뀌었어요/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '지금 교재로 다시 정리' }));
    await waitFor(() => expect(projectTidyAPI.request).toHaveBeenCalled());
  });

  it('쓸 수 있는 자료가 없으면 버튼이 열리지 않고 이유를 말한다', async () => {
    projectTidyAPI.get.mockResolvedValue(empty({ analyzingMaterialCount: 2 }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/아직 분석 중인 자료 2개뿐이에요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /이 프로젝트 자료 정리/ })).toBeDisabled();
  });

  it('무엇으로 정리하고 무엇이 빠지는지 먼저 말한다', async () => {
    projectTidyAPI.get.mockResolvedValue(empty({ readyMaterialCount: 5, analyzingMaterialCount: 2 }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText('분석 완료 5개로 정리 · 분석 중 2개 제외')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /이 프로젝트 자료 정리/ })).toBeEnabled();
  });

  it('누르면 정리 요청이 나가고 만드는 중임을 알린다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(empty({ readyMaterialCount: 3 }));
    projectTidyAPI.request.mockResolvedValue(empty({
      readyMaterialCount: 3, job: { jobId: 1, status: 'RUNNING' },
    }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /이 프로젝트 자료 정리/ }));

    expect(projectTidyAPI.request).toHaveBeenCalledWith(6, { refresh: false });
    expect(await screen.findByText(/정리안을 만드는 중이에요/)).toBeInTheDocument();
  });

  it('만들다 실패하면 이유와 다시 시도를 준다', async () => {
    projectTidyAPI.get.mockResolvedValue(empty({
      readyMaterialCount: 3,
      job: { jobId: 1, status: 'FAILED', message: '정리안을 만들지 못했어요', retryable: true },
    }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/정리안을 만들지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('예전 방식의 변경안이 남아 있으면 이력으로 뒀다고 알린다', async () => {
    projectTidyAPI.get.mockResolvedValue(empty({ readyMaterialCount: 1, legacyProposalCount: 4 }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/예전 방식\(자료 하나씩\)으로 만든 변경안 4개는 이력으로 남겨 뒀어요/))
      .toBeInTheDocument();
  });
});

describe('정리안 검토', () => {
  it('변경을 영향을 받는 항목으로 묶어 보여 준다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText('자료 연결 2곳 · 새 항목 1개')).toBeInTheDocument();
    // 파일 이름이 아니라 항목 이름이 묶음의 머리다.
    expect(screen.getByRole('button', { name: /스택/ })).toBeInTheDocument();
    expect(screen.getByText('자료 2개 검토')).toBeInTheDocument();
  });

  it('여러 자료의 근거를 한 변경 아래에서 펼쳐 볼 수 있다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(view());
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /스택.*변경 1/ }));
    await user.click(screen.getByRole('button', { name: /근거 2곳 보기/ }));

    expect(screen.getByText('강의슬라이드.pdf · p.3')).toBeInTheDocument();
    expect(screen.getByText('교재.pdf · p.30')).toBeInTheDocument();
  });

  it('입력 한도로 일부만 봤으면 부분 정리라고 말한다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({
      scope: { ...view().scope, truncated: true, sectionsTotal: 40, sectionsReviewed: 10 },
    }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/자료 구간 40개 중 10개만 보고 정리했어요/)).toBeInTheDocument();
  });

  it('제외된 자료와 사유를 숨기지 않는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({
      scope: {
        ...view().scope,
        excluded: [{ materialId: 30, filename: '실습.pdf', reason: 'ANALYZING', reasonLabel: '분석 중' }],
      },
    }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText('분석 중')).toBeInTheDocument();
    expect(screen.getByText(/실습\.pdf/)).toBeInTheDocument();
  });
});

describe('검토 중 편집', () => {
  it('체크를 풀면 딸린 변경도 함께 풀린다', async () => {
    const user = userEvent.setup();
    const base = view({
      groups: [{ key: 'nc1', kind: 'NEW', topicId: null, title: '부모', changeIds: ['p1', 'p2'] }],
      changes: [
        change('p1', 'ADD', '「부모」을(를) 새로 만들어요', { title: '부모' }),
        change('p2', 'ADD', '「자식」을(를) 새로 만들어요', { title: '자식', dependsOn: ['p1'] }),
      ],
      dependsOn: { p2: ['p1'] },
    });
    projectTidyAPI.get.mockResolvedValue(base);
    projectTidyAPI.saveEdits.mockImplementation(async (id, body) => ({
      ...base, edits: body.edits, editRevision: 1,
    }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /부모.*변경 2/ }));
    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]); // 부모를 뺀다

    await waitFor(() => expect(projectTidyAPI.saveEdits).toHaveBeenCalled());
    const saved = projectTidyAPI.saveEdits.mock.calls.at(-1)[1].edits;
    expect(saved.p1.excluded).toBe(true);
    expect(saved.p2.excluded).toBe(true);
  });

  it('제목을 고치면 자동 저장되고 저장됨을 알린다 — 트리는 바뀌지 않는다', async () => {
    const user = userEvent.setup();
    const base = view();
    projectTidyAPI.get.mockResolvedValue(base);
    projectTidyAPI.saveEdits.mockImplementation(async (id, body) => ({
      ...base, edits: body.edits, editRevision: 1,
    }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /원형 큐.*변경 1/ }));
    await user.type(screen.getByLabelText('항목 제목 고치기'), '!');

    await waitFor(() => expect(screen.getByText('저장됨')).toBeInTheDocument());
    expect(projectTidyAPI.saveEdits.mock.calls.at(-1)[1].edits.c2.title).toBe('원형 큐!');
    // 저장은 검토 초안일 뿐이다 — 적용은 따로 눌러야 한다.
    expect(projectTidyAPI.apply).not.toHaveBeenCalled();
  });

  it('저장이 아직 서버에 닿지 않았으면 적용을 막는다 — 이유 없는 409를 만들지 않는다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(view());
    // 저장이 끝나지 않은 상태를 만든다.
    projectTidyAPI.saveEdits.mockReturnValue(new Promise(() => {}));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /원형 큐.*변경 1/ }));
    await user.type(screen.getByLabelText('항목 제목 고치기'), '!');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /선택한 변경 적용/ })).toBeDisabled());
  });

  it('저장에 실패하면 알리고 적용을 막는다 — 조용히 넘기지 않는다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(view());
    projectTidyAPI.saveEdits.mockRejectedValue(new Error('서버 오류'));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /원형 큐.*변경 1/ }));
    await user.type(screen.getByLabelText('항목 제목 고치기'), '!');

    expect(await screen.findByText(/저장하지 못했어요 · 다시 시도해 주세요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /선택한 변경 적용/ })).toBeDisabled();
    // 고친 내용을 버리지 않는다. 다시 보낼 길이 화면에 있어야 한다.
    expect(screen.getByRole('button', { name: '다시 저장' })).toBeInTheDocument();
  });

  /*
    예전에는 이 자리에서 "최신을 다시 읽어 화면에 올린다"를 정답으로 고정하고 있었다.
    그 동작은 방금 친 제목을 소리 없이 지운다 — 다시 읽는다는 것은 내 편집을 서버 값으로
    갈아치운다는 뜻이기 때문이다. 요구가 바뀐 것이 아니라, 그 테스트가 사고를 정답으로
    적어 두고 있었다. 이제는 합치고, 정말 부딪히는 것만 사용자에게 묻는다.
  */
  it('다른 곳에서 먼저 고쳤어도 내 편집을 버리지 않는다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValueOnce(view())
      .mockResolvedValue(view({ editRevision: 7, edits: { c2: { title: '다른 탭이 고친 것' } } }));
    projectTidyAPI.saveEdits.mockRejectedValue(Object.assign(new Error('stale'), { code: 'E409_029' }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /원형 큐.*변경 1/ }));
    await user.type(screen.getByLabelText('항목 제목 고치기'), '!');

    // 서로 다른 변경을 고쳤으므로 충돌이 아니다 — 합쳐지고 내 글자는 그대로 남는다.
    await waitFor(() => expect(projectTidyAPI.get).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('항목 제목 고치기')).toHaveValue('원형 큐!');
  });
});

describe('새 자료와 트리 변경', () => {
  it('그 사이 끝난 자료는 섞지 않고 알리기만 한다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({ newMaterialCount: 2 }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/그 사이 분석이 끝난 자료 2개가 있어요/)).toBeInTheDocument();
    expect(screen.getByText(/지금 보는 정리안에는 들어 있지 않아요/)).toBeInTheDocument();
    // 다시 만드는 것은 사용자가 누를 때다.
    expect(projectTidyAPI.request).not.toHaveBeenCalled();
  });

  it('새 자료 반영해 다시 정리를 누르면 refresh로 요청한다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(view({ newMaterialCount: 1 }));
    projectTidyAPI.request.mockResolvedValue(view({ job: { jobId: 2, status: 'RUNNING' } }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /새 자료 반영해 다시 정리/ }));

    expect(projectTidyAPI.request).toHaveBeenCalledWith(6, { refresh: true });
  });

  it('트리가 바뀌었으면 정리안을 숨기지 않고 적용만 막는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({ treeChanged: true, currentTreeVersion: 4 }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/학습 구조가 바뀌었어요/)).toBeInTheDocument();
    // 내용은 그대로 보인다.
    expect(screen.getByText('자료 연결 2곳 · 새 항목 1개')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /선택한 변경 적용/ })).toBeDisabled();
  });
});

describe('적용과 버리기', () => {
  it('고른 변경만 실어 보내고 판 번호를 함께 보낸다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(view());
    projectTidyAPI.apply.mockResolvedValue(view({ status: 'APPLIED' }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /선택한 변경 적용/ }));

    expect(projectTidyAPI.apply).toHaveBeenCalledWith(11, {
      revision: 1,
      editRevision: 0,
      baseTreeVersion: 3,
      selectedChangeIds: ['c1', 'c2'],
      titleOverrides: {},
    });
  });

  it('일부만 골랐으면 버튼이 몇 개인지 말한다', async () => {
    const user = userEvent.setup();
    const base = view();
    projectTidyAPI.get.mockResolvedValue(base);
    projectTidyAPI.saveEdits.mockImplementation(async (id, body) => ({
      ...base, edits: body.edits, editRevision: 1,
    }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /스택.*변경 1/ }));
    await user.click(screen.getAllByRole('checkbox')[0]);

    expect(await screen.findByRole('button', { name: /선택한 1개 적용/ })).toBeInTheDocument();
  });

  it('버리기는 서버에 알리고 화면을 비운다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(view());
    projectTidyAPI.dismiss.mockResolvedValue(empty({ readyMaterialCount: 2, firstTime: false }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: '버리기' }));

    expect(projectTidyAPI.dismiss).toHaveBeenCalledWith(6);
    await waitFor(() =>
      expect(screen.queryByText('자료 연결 2곳 · 새 항목 1개')).not.toBeInTheDocument());
  });

  it('나중에는 검토 내용을 그대로 두고 화면만 옮긴다', async () => {
    const user = userEvent.setup();
    const onOpenMaterials = vi.fn();
    projectTidyAPI.get.mockResolvedValue(view());
    render(<ProjectTidyPanel courseId={6} onOpenMaterials={onOpenMaterials} />);

    await user.click(await screen.findByRole('button', { name: '나중에' }));

    expect(onOpenMaterials).toHaveBeenCalled();
    expect(projectTidyAPI.dismiss).not.toHaveBeenCalled();
  });

  it('바꿀 것이 없었으면 그렇게 말하고 트리는 그대로다', async () => {
    projectTidyAPI.get.mockResolvedValue(empty({
      proposalId: 12, status: 'EMPTY', readyMaterialCount: 3, firstTime: false,
    }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/바꿀 것이 없었어요/)).toBeInTheDocument();
  });

  it('병합·분할은 학습 기록이 어떻게 되는지 미리 말한다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(view({
      groups: [{ key: 't1', kind: 'EXISTING', topicId: 1, title: '스택', changeIds: ['m1'] }],
      changes: [change('m1', 'MERGE', '「큐」을(를) 「스택」에 합쳐요', {
        caution: '흡수되는 항목은 보관돼요. 학습 기록은 복제하지 않고, 승계가 애매하면 안내가 남아요',
      })],
    }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: /스택.*변경 1/ }));
    expect(screen.getByText(/흡수되는 항목은 보관돼요/)).toBeInTheDocument();
  });
});

describe('실패한 정리', () => {
  it('다시 시도는 요청 때의 입력으로 한다 — 새 요청이 아니다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(empty({
      readyMaterialCount: 3,
      job: { jobId: 5, status: 'FAILED', retryable: true, needsNewRequest: false, message: '정리안을 만들지 못했어요' },
    }));
    projectTidyAPI.retry.mockResolvedValue(empty({ readyMaterialCount: 3, job: { jobId: 6, status: 'QUEUED' } }));
    render(<ProjectTidyPanel courseId={6} />);

    await user.click(await screen.findByRole('button', { name: '다시 시도' }));

    expect(projectTidyAPI.retry).toHaveBeenCalledWith(6);
    expect(projectTidyAPI.request).not.toHaveBeenCalled();
  });

  it('입력이 바뀌어 멈췄으면 다시 시도 대신 새로 정리를 준다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(empty({
      readyMaterialCount: 3,
      job: {
        jobId: 5, status: 'FAILED', retryable: false, needsNewRequest: true, errorCode: 'STALE_INPUT',
        message: '요청한 뒤 자료가 바뀌었어요: 「강의.pdf」 다시 분석됨. 지금 자료로 다시 정리해 주세요',
      },
    }));
    projectTidyAPI.request.mockResolvedValue(empty({ readyMaterialCount: 3, job: { jobId: 7, status: 'QUEUED' } }));
    render(<ProjectTidyPanel courseId={6} />);

    expect(await screen.findByText(/「강의.pdf」 다시 분석됨/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '지금 자료로 새로 정리' }));

    expect(projectTidyAPI.request).toHaveBeenCalledWith(6, { refresh: true });
  });
});

describe('근거 원문 열기', () => {
  const withEvidence = (sections) => view({
    groups: [{ key: 't1', kind: 'EXISTING', topicId: 1, title: '스택', parentTitle: null, changeIds: ['c1'] }],
    changes: [change('c1', 'LINK', '「스택」에 근거를 연결해요', { sections })],
  });

  async function openEvidence(user) {
    await user.click(await screen.findByRole('button', { name: /스택.*변경 1/ }));
    await user.click(screen.getByRole('button', { name: /근거 1곳 보기/ }));
  }

  it('지금 파일의 PDF 쪽이면 그 쪽으로 여는 버튼을 준다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(withEvidence([{
      sectionId: 9, materialId: 21, materialFilename: '강의.pdf', locator: 'p.3', title: '스택 정의',
      availability: 'OK', page: 3,
    }]));
    render(<ProjectTidyPanel courseId={6} />);
    await openEvidence(user);

    expect(screen.getByRole('button', { name: /PDF p.3 열기/ })).toBeInTheDocument();
  });

  it('쪽으로 뛸 수 없는 형식은 여는 버튼과 위치를 글로 준다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(withEvidence([{
      sectionId: 9, materialId: 21, materialFilename: '실습.ipynb', locator: '셀 12', title: '스택 구현',
      availability: 'OK', page: null,
    }]));
    render(<ProjectTidyPanel courseId={6} />);
    await openEvidence(user);

    expect(screen.getByRole('button', { name: /파일 내려받기/ })).toBeInTheDocument();
    expect(screen.getByText(/위치로 바로 가지 못해요 — 위치: 셀 12/)).toBeInTheDocument();
  });

  it('예전 파일의 발췌면 그렇다고 말하고 지금 파일을 연다고 밝힌다', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(withEvidence([{
      sectionId: 9, materialId: 21, materialFilename: '강의.pdf', locator: 'p.3', title: '스택 정의',
      excerpt: '옛 발췌', availability: 'OUTDATED', page: null,
    }]));
    render(<ProjectTidyPanel courseId={6} />);
    await openEvidence(user);

    expect(screen.getByText(/예전 파일\(또는 예전 분석\)에서 나왔어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /지금 파일 열기/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /PDF p.3 열기/ })).not.toBeInTheDocument();
  });

  it('자료가 지워졌으면 여는 버튼을 두지 않는다 — 다른 파일을 열지 않게', async () => {
    const user = userEvent.setup();
    projectTidyAPI.get.mockResolvedValue(withEvidence([{
      sectionId: 9, materialId: 21, materialFilename: '강의.pdf', locator: 'p.3', title: '스택 정의',
      availability: 'MATERIAL_DELETED', page: null,
    }]));
    render(<ProjectTidyPanel courseId={6} />);
    await openEvidence(user);

    expect(screen.getByText('자료가 지워져 원본을 열 수 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /열기|내려받기/ })).not.toBeInTheDocument();
  });
});

describe('학습 구조 조정 요청과 전후 보기', () => {
  const adjusted = () => view({
    origin: 'REQUEST',
    userRequest: '교재 5장을 3장보다 먼저 수업했어',
    summary: { headline: '실제 수업·범위 정정 1건', structural: false, total: 2 },
    tree: [
      { topicId: 1, parentTopicId: null, title: '3장 스택', orderIndex: 0 },
      { topicId: 2, parentTopicId: null, title: '4장 큐', orderIndex: 1 },
    ],
    groups: [{ key: 't1', kind: 'EXISTING', topicId: 1, title: '3장 스택', parentTitle: null, changeIds: ['c1', 'c2'] }],
    changes: [
      change('c1', 'CLASS', '실제 수업에서 「3장 스택」을(를) 2주차에 다룬 것으로 기록해요 (교재 구조는 그대로)', {
        by: 'REQUEST', treeOp: false, payload: { op: 'CLASS', topicId: 1, week: 2 },
      }),
      change('c2', 'MOVE', '「4장 큐」을(를) 맨 위 단계의 맨 앞로 옮겨요', {
        by: 'REQUEST', payload: { op: 'MOVE', topicId: 2, parentTopicId: null, afterTopicId: 0 },
        impact: [{ topicId: 2, title: '4장 큐', openItems: 2, doneItems: 1, contexts: 0, progress: 'IN_PROGRESS' }],
      }),
    ],
  });

  it('말로 한 요청은 해석만 하고 정리안에 더한다 — 되묻는 말이 있으면 보인다', async () => {
    projectTidyAPI.get.mockResolvedValue(empty({ readyMaterialCount: 2 }));
    structureAPI.request.mockResolvedValue({ tidy: adjusted(), summary: '5장을 실제 수업 2주차로 옮겼어요', added: 1,
      question: '4장도 3장보다 먼저였나요?', dropped: [] });
    render(<ProjectTidyPanel courseId={6} />);

    await userEvent.type(await screen.findByLabelText(/학습 구조 조정/), '교재 5장을 3장보다 먼저 수업했어');
    await userEvent.click(screen.getByRole('button', { name: /조정안 만들기/ }));

    await waitFor(() => expect(structureAPI.request).toHaveBeenCalledWith(6, '교재 5장을 3장보다 먼저 수업했어'));
    expect(await screen.findByText('5장을 실제 수업 2주차로 옮겼어요')).toBeInTheDocument();
    expect(screen.getByText(/확인이 필요해요: 4장도 3장보다 먼저였나요\?/)).toBeInTheDocument();
    expect(screen.getByText(/요청: “교재 5장을 3장보다 먼저 수업했어”/)).toBeInTheDocument();
    expect(projectTidyAPI.apply).not.toHaveBeenCalled();
  });

  it('전후 구조와 걸린 기록을 보여 주고, 실제 수업 정정은 구조가 아니라 표시로 남는다', async () => {
    projectTidyAPI.get.mockResolvedValue(adjusted());
    render(<ProjectTidyPanel courseId={6} />);

    await userEvent.click(await screen.findByRole('button', { name: /구조 전후 보기/ }));
    expect(screen.getByText('고른 변경을 적용하면')).toBeInTheDocument();
    expect(screen.getByText('실제 수업 2주차')).toBeInTheDocument();
    expect(screen.getByText('위치 바뀜')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /3장 스택/ }));
    expect(screen.getByText(/「4장 큐」에 걸린 기록: 남은 할 일 2 · 끝낸 것 1 · 진도 기록 있음 — 기록은 옮기거나 지우지 않아요/))
      .toBeInTheDocument();
    expect(screen.getAllByText('내 요청').length).toBeGreaterThan(0);
  });
  it('다시 붙어도(StrictMode·탭 전환) 조회가 끝나면 "불러오는 중"에 멈추지 않는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    const first = render(<StrictMode><ProjectTidyPanel courseId={6} /></StrictMode>);
    expect(await screen.findByText('원형 큐')).toBeInTheDocument();
    first.unmount();

    render(<StrictMode><ProjectTidyPanel courseId={6} /></StrictMode>);
    expect(await screen.findByText('원형 큐')).toBeInTheDocument();
    expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();
  });
});
