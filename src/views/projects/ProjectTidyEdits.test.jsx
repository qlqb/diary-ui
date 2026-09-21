/**
 * 검토 편집이 사라지지 않는다 — 그리고 버린 안이 돌아오지 않는다.
 *
 * 여기 있는 것은 전부 "사용자가 한 일이 없어졌다"는 한 종류의 사고다. 자동 저장이 있다는
 * 사실만으로는 막히지 않는다. 0.7초를 기다리는 동안 화면을 옮기거나, 느린 응답이 새 입력
 * 위에 떨어지거나, 다른 탭이 먼저 저장했거나, 자료 분석이 끝나 목록이 새로 그려지는 것은
 * 전부 평범한 사용 중에 일어난다.
 *
 * 뒤쪽 절반은 반대 방향이다. 버리기·적용이 끝난 뒤 늦게 도착한 응답이 화면을 되돌려
 * 놓으면, 사용자는 없앴다고 생각한 것을 다시 보게 된다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/api.js', () => ({
  projectTidyAPI: {
    get: vi.fn(), request: vi.fn(), saveEdits: vi.fn(), apply: vi.fn(), dismiss: vi.fn(), history: vi.fn(),
  },
}));

import ProjectTidyPanel from './ProjectTidyPanel.jsx';
import { projectTidyAPI } from '../../api/api.js';
import { __resetAll } from '../../lib/tidyEditStore.js';

// ===== 도구 =====

/** 우리가 원할 때 끝나는 약속. 응답 순서를 의도대로 뒤집으려면 필요하다. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const change = (changeId, op, text, extra = {}) => ({
  changeId, op, label: op, text, reason: null, titleEditable: op === 'ADD' || op === 'RENAME',
  title: null, structural: false, dependsOn: [], caution: null, sections: [], ...extra,
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
    summary: { headline: '새 항목 2개', structural: false, total: 2 },
    groups: [
      { key: 'n1', kind: 'NEW', topicId: null, title: '원형 큐', parentTitle: null, changeIds: ['c1'] },
      { key: 'n2', kind: 'NEW', topicId: null, title: '연결 리스트', parentTitle: null, changeIds: ['c2'] },
    ],
    changes: [
      change('c1', 'ADD', '맨 위에 「원형 큐」을(를) 새로 만들어요', { title: '원형 큐' }),
      change('c2', 'ADD', '맨 위에 「연결 리스트」을(를) 새로 만들어요', { title: '연결 리스트' }),
    ],
    dependsOn: {},
    edits: {},
    editRevision: 0,
    scope: {
      courseId: 6, treeVersion: 3, topicCount: 2, treeLinesShown: 2,
      reviewed: [{ materialId: 21, filename: '강의.pdf', sectionCount: 4, reviewedCount: 4 }],
      excluded: [], truncated: false, sectionsTotal: 4, sectionsReviewed: 4,
    },
    newMaterialCount: 0,
    readyMaterialCount: 1,
    analyzingMaterialCount: 0,
    firstTime: false,
    legacyProposalCount: 0,
    ...overrides,
  };
}

const gone = (overrides = {}) => ({
  courseId: 6, proposalId: null, status: null, job: null, groups: [], changes: [], dependsOn: {},
  edits: {}, editRevision: 0, scope: null, readyMaterialCount: 1, analyzingMaterialCount: 0,
  newMaterialCount: 0, firstTime: false, legacyProposalCount: 0, ...overrides,
});

/** 제목 칸을 changeId 순서로 돌려준다. */
const titleInputs = () => screen.getAllByLabelText('항목 제목 고치기');

async function openPanel(props = {}) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const utils = render(<ProjectTidyPanel courseId={6} {...props} />);
  await screen.findByText(/새 항목 2개/);
  // 제목 칸은 묶음을 펼쳐야 보인다. 여기서 검증하려는 것은 접기/펼치기가 아니다.
  await user.click(screen.getByRole('button', { name: '전부 펼쳐 보기' }));
  return { user, ...utils };
}

/** 사용자가 제목 칸을 지우고 새로 친다. */
async function retype(user, input, text) {
  await user.clear(input);
  await user.type(input, text);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetAll();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 토큰이 있어야 복구 저장소가 사용자별로 갈린다. sub=7인 가짜 JWT.
  localStorage.setItem('token', `x.${btoa(JSON.stringify({ sub: 7 }))}.y`);
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  __resetAll();
});

// ===== 1. 편집 유실 =====

describe('편집은 화면을 옮겨도 사라지지 않는다', () => {
  it('자동 저장이 나가기 전에 구역을 옮겨도 고친 제목이 저장된다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    projectTidyAPI.saveEdits.mockResolvedValue(view({ editRevision: 1, edits: { c1: { title: '원형 큐 구현' } } }));
    const { user, unmount } = await openPanel();

    await retype(user, titleInputs()[0], '원형 큐 구현');
    // 0.7초가 지나기 <전에> 다른 구역으로 간다. 패널은 여기서 사라진다.
    unmount();

    await waitFor(() => expect(projectTidyAPI.saveEdits).toHaveBeenCalled());
    expect(projectTidyAPI.saveEdits.mock.calls[0][1].edits.c1.title).toBe('원형 큐 구현');
  });

  it('돌아오면 고친 제목이 그대로 있다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    const save = deferred();
    projectTidyAPI.saveEdits.mockReturnValue(save.promise);
    const first = await openPanel();

    await retype(first.user, titleInputs()[0], '원형 큐 구현');
    first.unmount();

    // 아직 서버 응답이 오기 전에 돌아온다. 서버는 여전히 옛 제목을 준다.
    await openPanel();
    expect(titleInputs()[0]).toHaveValue('원형 큐 구현');
  });

  it('느린 이전 응답이 그 뒤에 친 글자를 되돌리지 않는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    const slow = deferred();
    projectTidyAPI.saveEdits.mockReturnValueOnce(slow.promise)
      .mockResolvedValue(view({ editRevision: 2, edits: { c1: { title: 'B' } } }));
    const { user } = await openPanel();

    await retype(user, titleInputs()[0], 'A');
    await act(async () => { vi.advanceTimersByTime(800); });
    await waitFor(() => expect(projectTidyAPI.saveEdits).toHaveBeenCalledTimes(1));

    // A가 아직 날아가는 중에 B를 친다.
    await retype(user, titleInputs()[0], 'B');
    // 이제 A의 응답이 도착한다. 서버는 A를 저장했다고 답한다.
    await act(async () => {
      slow.resolve(view({ editRevision: 1, edits: { c1: { title: 'A' } } }));
      await Promise.resolve();
    });

    expect(titleInputs()[0]).toHaveValue('B');
    await act(async () => { vi.advanceTimersByTime(800); });
    await waitFor(() => expect(projectTidyAPI.saveEdits).toHaveBeenCalledTimes(2));
    expect(projectTidyAPI.saveEdits.mock.calls[1][1].edits.c1.title).toBe('B');
  });

  it('자료 분석이 끝나 목록을 새로 읽어도 입력 중인 제목이 남는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    projectTidyAPI.saveEdits.mockResolvedValue(view({ editRevision: 1 }));
    const { user, rerender } = await openPanel();

    await retype(user, titleInputs()[0], '입력 중');
    // 자료 분석 완료 → 부모가 refreshToken을 올려 다시 조회하게 만든다.
    projectTidyAPI.get.mockResolvedValue(view({ newMaterialCount: 1 }));
    rerender(<ProjectTidyPanel courseId={6} refreshToken={1} />);

    await screen.findByText(/그 사이 분석이 끝난 자료 1개/);
    expect(titleInputs()[0]).toHaveValue('입력 중');
  });

  it('409는 내 편집을 버리지 않고 충돌만 알린다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    const conflict = Object.assign(new Error('다른 곳에서 먼저 고쳤어요'), { code: 'E409_029' });
    projectTidyAPI.saveEdits.mockRejectedValue(conflict);
    const { user } = await openPanel();

    await retype(user, titleInputs()[0], '내가 친 제목');
    // 서버 최신본은 다른 값을 들고 있다.
    projectTidyAPI.get.mockResolvedValue(view({
      editRevision: 5, edits: { c1: { title: '다른 탭이 친 제목' } },
    }));
    await act(async () => { vi.advanceTimersByTime(800); });

    // 충돌을 읽으려 서버 최신본을 한 번 더 읽는다. 그리고 <멈춘다> — 사용자가 고르기
    // 전에는 같은 왕복을 반복하지 않는다.
    await waitFor(() => expect(screen.getByText(/어느 쪽을 쓸지 골라 주세요/)).toBeInTheDocument());
    expect(projectTidyAPI.get).toHaveBeenCalledTimes(2);
    expect(titleInputs()[0]).toHaveValue('내가 친 제목');
    expect(screen.getByRole('button', { name: '내 편집 유지' })).toBeInTheDocument();
  });

  it('저장이 실패해도 편집은 남고 다시 시도할 수 있다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    projectTidyAPI.saveEdits.mockRejectedValue(new Error('네트워크가 끊겼어요'));
    const { user, unmount } = await openPanel();

    await retype(user, titleInputs()[0], '살아남아야 함');
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(await screen.findByText(/저장하지 못했어요/)).toBeInTheDocument();

    // 실패한 채로 화면을 떠났다 돌아온다.
    unmount();
    await openPanel();
    expect(titleInputs()[0]).toHaveValue('살아남아야 함');
    expect(screen.getByRole('button', { name: '다시 저장' })).toBeInTheDocument();
  });

  it('미저장 편집이 있으면 적용을 막는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    const never = deferred();
    projectTidyAPI.saveEdits.mockReturnValue(never.promise);
    const { user } = await openPanel();

    await retype(user, titleInputs()[0], '아직 안 갔음');
    expect(screen.getByRole('button', { name: /변경 적용/ })).toBeDisabled();
  });
});

describe('새로고침 뒤 복구', () => {
  it('저장되지 못한 편집은 새로고침해도 돌아온다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    const never = deferred();
    projectTidyAPI.saveEdits.mockReturnValue(never.promise);
    const { user, unmount } = await openPanel();
    await retype(user, titleInputs()[0], '복구될 제목');
    unmount();

    // 저장소에 남아 있어야 새로고침을 견딘다.
    expect(localStorage.getItem('tidyEdits:v1')).toContain('복구될 제목');

    // 새로고침: 모듈 상태는 전부 사라지고 localStorage만 남는다.
    __resetAll({ keepStorage: true });
    // 실제 서버는 저장한 것을 그대로 돌려준다.
    projectTidyAPI.saveEdits.mockImplementation((_id, body) =>
      Promise.resolve(view({ editRevision: 1, edits: body.edits })));
    await openPanel();

    expect(titleInputs()[0]).toHaveValue('복구될 제목');
  });

  it('버려진 안의 복구 데이터는 되살리지 않는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    const never = deferred();
    projectTidyAPI.saveEdits.mockReturnValue(never.promise);
    const { user, unmount } = await openPanel();
    await retype(user, titleInputs()[0], '버려질 제목');
    unmount();

    // 서버는 이제 그 정리안이 없다고 답한다(다른 곳에서 버렸다).
    projectTidyAPI.get.mockResolvedValue(gone());
    render(<ProjectTidyPanel courseId={6} />);

    await waitFor(() => expect(screen.queryByLabelText('항목 제목 고치기')).not.toBeInTheDocument());
    expect(localStorage.getItem('tidyEdits:v1')).toBeNull();
  });
});

// ===== 2. 늦게 도착한 응답 =====

describe('버리기·적용 뒤 늦게 온 응답', () => {
  it('버린 뒤 도착한 이전 조회가 정리안을 되살리지 않는다', async () => {
    const slowGet = deferred();
    // 첫 조회는 정상, 두 번째 조회(폴링/재조회)는 우리가 붙잡는다.
    projectTidyAPI.get.mockResolvedValueOnce(view()).mockReturnValueOnce(slowGet.promise);
    projectTidyAPI.dismiss.mockResolvedValue(gone());
    const { user, rerender } = await openPanel();

    // 붙잡힌 조회를 띄운다.
    rerender(<ProjectTidyPanel courseId={6} refreshToken={1} />);

    await user.click(screen.getByRole('button', { name: '버리기' }));
    await waitFor(() => expect(projectTidyAPI.dismiss).toHaveBeenCalled());

    // 이제 버리기 <전에> 떠난 조회가 도착한다. 옛 정리안을 들고 있다.
    await act(async () => { slowGet.resolve(view()); await Promise.resolve(); });

    expect(screen.queryByText(/새 항목 2개/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '버리기' })).not.toBeInTheDocument();
  });

  it('버린 뒤 도착한 이전 편집 저장 응답도 화면을 되돌리지 않는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view());
    const slowSave = deferred();
    projectTidyAPI.saveEdits.mockReturnValue(slowSave.promise);
    projectTidyAPI.dismiss.mockResolvedValue(gone());
    const { user } = await openPanel();

    await retype(user, titleInputs()[0], '보내는 중');
    await act(async () => { vi.advanceTimersByTime(800); });
    await waitFor(() => expect(projectTidyAPI.saveEdits).toHaveBeenCalled());

    projectTidyAPI.get.mockResolvedValue(gone());
    await user.click(screen.getByRole('button', { name: '버리기' }));
    await waitFor(() => expect(projectTidyAPI.dismiss).toHaveBeenCalled());

    await act(async () => {
      slowSave.resolve(view({ editRevision: 9, edits: { c1: { title: '보내는 중' } } }));
      await Promise.resolve();
    });

    expect(screen.queryByText(/새 항목 2개/)).not.toBeInTheDocument();
    expect(localStorage.getItem('tidyEdits:v1')).toBeNull();
  });

  it('적용이 끝난 뒤 도착한 이전 조회도 정리안을 되살리지 않는다', async () => {
    const slowGet = deferred();
    projectTidyAPI.get.mockResolvedValueOnce(view()).mockReturnValueOnce(slowGet.promise)
      .mockResolvedValue(gone());
    projectTidyAPI.apply.mockResolvedValue(gone({ status: 'APPLIED' }));
    const { user, rerender } = await openPanel();

    rerender(<ProjectTidyPanel courseId={6} refreshToken={1} />);
    await user.click(screen.getByRole('button', { name: /변경 적용/ }));
    await waitFor(() => expect(projectTidyAPI.apply).toHaveBeenCalled());

    await act(async () => { slowGet.resolve(view()); await Promise.resolve(); });

    expect(screen.queryByRole('button', { name: /변경 적용/ })).not.toBeInTheDocument();
  });

  it('다른 프로젝트로 옮긴 뒤 도착한 응답이 새 프로젝트에 섞이지 않는다', async () => {
    const slowGet = deferred();
    projectTidyAPI.get.mockReturnValueOnce(slowGet.promise)
      .mockResolvedValue(view({ courseId: 7, proposalId: 12, summary: { headline: '다른 프로젝트 안' } }));
    const { rerender } = render(<ProjectTidyPanel courseId={6} />);

    rerender(<ProjectTidyPanel courseId={7} />);
    await screen.findByText('다른 프로젝트 안');

    await act(async () => { slowGet.resolve(view()); await Promise.resolve(); });

    expect(screen.queryByText(/새 항목 2개/)).not.toBeInTheDocument();
    expect(screen.getByText('다른 프로젝트 안')).toBeInTheDocument();
  });
});

// ===== 4. 옮겨 온 편집 확인 =====

describe('판이 바뀌며 옮겨 온 편집', () => {
  const carried = (reason) => ({
    needsConfirm: true,
    excluded: true,
    title: null,
    carriedFrom: { changeId: 'old1', text: '새 항목 「원형 큐」', reason },
  });

  it('무엇이 달라졌는지 보여주고 해결하기 전에는 적용을 막는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({
      editRevision: 1,
      edits: { c1: carried('제안한 이름이(가) 달라졌어요'), c2: carried('근거 구간이(가) 달라졌어요') },
    }));
    await openPanel();

    expect(screen.getByText('제안한 이름이(가) 달라졌어요')).toBeInTheDocument();
    expect(screen.getAllByText('전에 붙어 있던 제안: 새 항목 「원형 큐」')).toHaveLength(2);
    expect(screen.getByText(/옮겨 온 편집 2건을 확인해야 적용할 수 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /변경 적용|골라주세요/ })).toBeDisabled();
  });

  it('하나만 해결하면 나머지 때문에 여전히 막힌다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({
      editRevision: 1,
      edits: { c1: carried('제안한 이름이(가) 달라졌어요'), c2: carried('근거 구간이(가) 달라졌어요') },
    }));
    projectTidyAPI.saveEdits.mockImplementation((_id, body) => Promise.resolve(view({
      editRevision: 2,
      edits: {
        c1: { excluded: true, title: null, needsConfirm: false },
        c2: carried('근거 구간이(가) 달라졌어요'),
      },
      ...(body.resolveCarried ? {} : {}),
    })));
    const { user } = await openPanel();

    await user.click(screen.getAllByRole('button', { name: '이 편집 유지' })[0]);
    await waitFor(() => expect(projectTidyAPI.saveEdits).toHaveBeenCalled());

    // 서버에 확인을 보낼 때는 판 번호를 함께 싣는다. 서버가 그것으로 확인을 검증한다.
    const body = projectTidyAPI.saveEdits.mock.calls[0][1];
    expect(body.resolveCarried).toEqual({ c1: 'KEEP' });
    expect(body.revision).toBe(1);

    expect(await screen.findByText(/옮겨 온 편집 1건을 확인해야/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /변경 적용|골라주세요|개 적용/ })).toBeDisabled();
  });

  it('새 제안 사용은 옮겨 온 편집을 거둔다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({
      editRevision: 1, edits: { c1: carried('제안한 이름이(가) 달라졌어요') },
    }));
    projectTidyAPI.saveEdits.mockResolvedValue(view({ editRevision: 2, edits: {} }));
    const { user } = await openPanel();

    await user.click(screen.getByRole('button', { name: '새 제안 사용' }));

    await waitFor(() => expect(projectTidyAPI.saveEdits).toHaveBeenCalled());
    expect(projectTidyAPI.saveEdits.mock.calls[0][1].resolveCarried).toEqual({ c1: 'DROP' });
    await waitFor(() => expect(screen.queryByText(/확인해야 적용할 수 있어요/)).not.toBeInTheDocument());
  });

  it('다른 제목을 고쳐도 확인 표시는 남는다', async () => {
    projectTidyAPI.get.mockResolvedValue(view({
      editRevision: 1, edits: { c1: carried('제안한 이름이(가) 달라졌어요') },
    }));
    // 서버는 needsConfirm을 지키고 돌려준다(요청에 실려 오지 않는 값이다).
    projectTidyAPI.saveEdits.mockImplementation((_id, body) => Promise.resolve(view({
      editRevision: 2,
      edits: { ...body.edits, c1: { ...body.edits.c1, needsConfirm: true, carriedFrom: carried('x').carriedFrom } },
    })));
    const { user } = await openPanel();

    await retype(user, titleInputs()[1], '연결 리스트 구현');
    await act(async () => { vi.advanceTimersByTime(800); });
    await waitFor(() => expect(projectTidyAPI.saveEdits).toHaveBeenCalled());

    // 확인은 보내지 않았다 — 다른 제목을 저장한 것뿐이다.
    expect(projectTidyAPI.saveEdits.mock.calls[0][1].resolveCarried).toBeUndefined();
    expect(screen.getByText(/옮겨 온 편집 1건을 확인해야/)).toBeInTheDocument();
  });
});
