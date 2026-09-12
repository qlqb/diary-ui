/**
 * 프로젝트 화면에 들어올 때 검토 중이던 구조 분석 초안을 되살리는지 고정한다.
 *
 * 이게 없으면 새로고침한 순간 검토 폼이 사라지고 "구조 분석" 버튼이 다시 나온다. 사용자는
 * 초안이 없어진 줄 알고 다시 누르고, 그때마다 AI가 호출되고 DRAFT가 쌓인다 — 실제로 그렇게
 * 한 자료에 초안이 두 건 남았다.
 *
 * 특히 "조회가 끝나기 전에는 버튼을 열지 않는다"가 중요하다. 잠깐 보였다 사라지는 그 사이의
 * 클릭이 곧 중복 분석이고, 조회 실패를 "초안 없음"으로 취급하는 것도 같은 결과를 낸다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectWorkspace from './ProjectWorkspace.jsx';
import {
  courseAPI, courseNoteAPI, executionItemAPI, materialAPI, materialAnalysisAPI, planAPI, topicAPI,
} from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  courseAPI: { get: vi.fn(), update: vi.fn(), archive: vi.fn() },
  courseNoteAPI: { list: vi.fn() },
  executionItemAPI: { getByCourse: vi.fn(), getByDateRange: vi.fn() },
  materialAPI: { upload: vi.fn(), listByCourse: vi.fn() },
  materialAnalysisAPI: {
    analyze: vi.fn(), dismiss: vi.fn(), listByMaterial: vi.fn(), edit: vi.fn(), apply: vi.fn(),
  },
  materialStoreAPI: { list: vi.fn(), addLink: vi.fn(), removeLink: vi.fn(), updateLinkType: vi.fn() },
  topicAPI: { getTree: vi.fn() },
  planAPI: { findCoveringDate: vi.fn() },
}));

const COURSE_ID = 6;

function material(materialId, filename) {
  return {
    materialId,
    courseId: COURSE_ID,
    materialType: 'SYLLABUS',
    originalFilename: filename,
    extractionStatus: 'SUCCESS',
  };
}

function draft(analysisId, createdAt, title = '개발환경 구축') {
  return {
    analysisId,
    courseId: COURSE_ID,
    materialId: 4,
    status: 'DRAFT',
    createdAt,
    payload: {
      summary: '강의계획서에서 읽었어요',
      courseFields: {
        textbookTitle: null, textbookAuthor: null, textbookPublisher: null, textbookIsbn: null,
      },
      courseNotes: [],
      keyDates: [],
      topics: [{ title, sourceType: 'SOURCE', sourceLocator: '1주차', children: [] }],
    },
  };
}

function renderWorkspace() {
  return render(
    <ProjectWorkspace
      courseId={COURSE_ID}
      onBack={vi.fn()}
      onAsk={vi.fn()}
      draft={null}
      onPatchCard={vi.fn()}
      onToggleExclude={vi.fn()}
      onProjectsChanged={vi.fn()}
    />,
  );
}

describe('구조 분석 초안 복원', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planAPI.findCoveringDate.mockResolvedValue([]);
    executionItemAPI.getByDateRange.mockResolvedValue([]);
    executionItemAPI.getByCourse.mockResolvedValue([]);
    courseAPI.get.mockResolvedValue({ courseId: COURSE_ID, title: '웹서버프로그래밍', status: 'ACTIVE' });
    materialAPI.listByCourse.mockResolvedValue([material(4, '웹서버프로그래밍.pdf')]);
    topicAPI.getTree.mockResolvedValue([]);
    courseNoteAPI.list.mockResolvedValue([]);
    materialAnalysisAPI.listByMaterial.mockResolvedValue([]);
  });

  it('화면에 들어오면 자료마다 분석 이력을 조회한다', async () => {
    renderWorkspace();

    await waitFor(() =>
      expect(materialAnalysisAPI.listByMaterial).toHaveBeenCalledWith(COURSE_ID, 4));
  });

  it('검토 중이던 초안이 있으면 새로고침 뒤에도 검토 폼이 나오고 분석 버튼은 없다', async () => {
    materialAnalysisAPI.listByMaterial.mockResolvedValue([draft(8, '2026-08-31T15:52:20')]);

    renderWorkspace();

    expect(await screen.findByRole('button', { name: /구조 분석 결과/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '구조 분석' })).not.toBeInTheDocument();
  });

  it('초안이 없으면 조회가 끝난 뒤에 분석 버튼이 나온다', async () => {
    renderWorkspace();

    expect(await screen.findByRole('button', { name: '구조 분석' })).toBeInTheDocument();
  });

  /*
   * 조회가 끝나기 전에 버튼이 잠깐이라도 보이면 그 사이의 클릭이 중복 분석이 된다.
   * 응답을 붙잡아 둔 채로 확인한다.
   */
  it('조회가 끝나기 전에는 분석 버튼이 보이지 않는다', async () => {
    let release;
    materialAnalysisAPI.listByMaterial.mockReturnValue(
      new Promise((resolve) => { release = () => resolve([]); }),
    );

    renderWorkspace();

    expect(await screen.findByText('초안 확인 중...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '구조 분석' })).not.toBeInTheDocument();

    release();
    expect(await screen.findByRole('button', { name: '구조 분석' })).toBeInTheDocument();
  });

  /* 실패를 "초안 없음"으로 취급하면 버튼이 열리고, 그게 바로 중복을 만드는 경로다. */
  it('조회에 실패하면 분석 버튼 대신 오류와 다시 시도를 보여준다', async () => {
    materialAnalysisAPI.listByMaterial.mockRejectedValue(new Error('네트워크 오류'));

    renderWorkspace();

    expect(await screen.findByText('초안을 확인하지 못했어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '구조 분석' })).not.toBeInTheDocument();
  });

  it('다시 시도가 성공하면 그 자료만 정상 상태로 돌아온다', async () => {
    const user = userEvent.setup();
    materialAnalysisAPI.listByMaterial.mockRejectedValueOnce(new Error('네트워크 오류'));
    materialAnalysisAPI.listByMaterial.mockResolvedValue([]);

    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('button', { name: '구조 분석' })).toBeInTheDocument();
  });

  it('한 자료의 조회가 실패해도 다른 자료의 초안은 복원된다', async () => {
    materialAPI.listByCourse.mockResolvedValue([
      material(4, '웹서버프로그래밍.pdf'),
      material(5, '자료구조.pdf'),
    ]);
    materialAnalysisAPI.listByMaterial.mockImplementation((courseId, materialId) =>
      (materialId === 5
        ? Promise.reject(new Error('네트워크 오류'))
        : Promise.resolve([draft(8, '2026-08-31T15:52:20')])));

    renderWorkspace();

    expect(await screen.findByRole('button', { name: /구조 분석 결과/ })).toBeInTheDocument();
    expect(screen.getByText('초안을 확인하지 못했어요')).toBeInTheDocument();
  });

  /*
   * 마이그레이션 전 레거시 데이터에는 초안이 여러 건 남아 있을 수 있다. 화면은 하나만 연다.
   * 다만 정합성을 지키는 것은 DB의 유일 인덱스이지 이 선택 로직이 아니다.
   */
  it('초안이 여러 건이면 최신 하나만 연다', async () => {
    materialAnalysisAPI.listByMaterial.mockResolvedValue([
      draft(8, '2026-08-31T15:52:20', '최신 초안 항목'),
      draft(4, '2026-08-31T15:52:04', '오래된 초안 항목'),
    ]);

    renderWorkspace();
    await userEvent.click(await screen.findByRole('button', { name: /구조 분석 결과/ }));

    expect(screen.getByDisplayValue('최신 초안 항목')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('오래된 초안 항목')).not.toBeInTheDocument();
  });

  /* 서버가 201(새로 만듦)로 주든 200(기존 것 재사용)으로 주든 화면이 하는 일은 같다. */
  it('분석 요청이 기존 초안을 돌려줘도 검토 폼이 열린다', async () => {
    const user = userEvent.setup();
    materialAnalysisAPI.analyze.mockResolvedValue(draft(8, '2026-08-31T15:52:20'));

    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: '구조 분석' }));

    expect(await screen.findByRole('button', { name: /구조 분석 결과/ })).toBeInTheDocument();
  });

  /*
   * 프로젝트를 바꾸는 순간 courseId는 즉시 바뀌지만 materials는 load()가 끝나야 바뀐다.
   * 그 틈에 복원이 돌면 "새 프로젝트 번호 × 이전 프로젝트 자료"라는 있지도 않은 조합으로
   * 요청이 나가고, 서버는 연결되지 않은 자료라며 404를 준다. 실제 콘솔에 그 404가 사이드바를
   * 오르내린 만큼 쌓여 있었다(32/92, 33/93, 190/92 ... 전부 한 칸씩 어긋난 조합).
   */
  describe('프로젝트 전환', () => {
    const OTHER_COURSE_ID = 7;

    it('이전 프로젝트의 자료로 새 프로젝트에 묻지 않는다', async () => {
      // 두 번째 프로젝트의 자료 조회를 붙잡아 둔다 — materials가 아직 안 바뀐 상태를 만든다.
      let releaseMaterials;
      const pending = new Promise((resolve) => { releaseMaterials = resolve; });

      const { rerender } = renderWorkspace();
      await waitFor(() =>
        expect(materialAnalysisAPI.listByMaterial).toHaveBeenCalledWith(COURSE_ID, 4));

      materialAPI.listByCourse.mockReturnValue(pending);
      courseAPI.get.mockResolvedValue({ courseId: OTHER_COURSE_ID, title: '빅데이터분석', status: 'ACTIVE' });
      materialAnalysisAPI.listByMaterial.mockClear();

      rerender(
        <ProjectWorkspace
          courseId={OTHER_COURSE_ID}
          onBack={vi.fn()}
          onAsk={vi.fn()}
          draft={null}
          onPatchCard={vi.fn()}
          onToggleExclude={vi.fn()}
          onProjectsChanged={vi.fn()}
        />,
      );

      // 자료 목록이 아직 이전 프로젝트 것인 동안에는 아무것도 묻지 않는다.
      await Promise.resolve();
      expect(materialAnalysisAPI.listByMaterial).not.toHaveBeenCalled();

      releaseMaterials([material(9, '빅데이터분석.pdf')]);

      // 새 자료가 도착한 뒤에야, 그것도 올바른 조합으로만 묻는다.
      await waitFor(() =>
        expect(materialAnalysisAPI.listByMaterial).toHaveBeenCalledWith(OTHER_COURSE_ID, 9));
      expect(materialAnalysisAPI.listByMaterial).not.toHaveBeenCalledWith(OTHER_COURSE_ID, 4);
    });
  });
});
