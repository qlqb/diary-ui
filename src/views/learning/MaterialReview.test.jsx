import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaterialReview from './MaterialReview.jsx';
import { materialAnalysisAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  materialAnalysisAPI: { edit: vi.fn(), apply: vi.fn() },
}));

const analysis = {
  analysisId: 7,
  status: 'DRAFT',
  payload: {
    summary: '목차를 찾았어요',
    courseFields: { textbookTitle: null, textbookAuthor: null, textbookPublisher: null, textbookIsbn: null },
    keyDates: [],
    topics: [
      {
        title: '연결 리스트',
        sourceType: 'SOURCE',
        sourceLocator: '3장',
        children: [
          { title: '단순 연결 리스트', sourceType: 'SOURCE', sourceLocator: '3.1', children: [] },
        ],
      },
    ],
  },
};

/**
 * 검토 폼은 기본이 접힘이다(프로젝트 화면을 통째로 밀지 않기 위해). 본문을 검사하는
 * 테스트는 먼저 펼친다 — 접힘 자체는 아래 별도 테스트가 고정한다.
 */
async function renderOpened(analysis, props = {}) {
  render(<MaterialReview analysis={analysis} onApplied={vi.fn()} onDismiss={vi.fn()} {...props} />);
  await userEvent.click(screen.getByRole('button', { name: /구조 분석 결과/ }));
}

describe('MaterialReview - AI 분석 초안 편집', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialAnalysisAPI.edit.mockResolvedValue({});
    materialAnalysisAPI.apply.mockResolvedValue({});
  });

  it('잘못된 하위 항목을 제거하고 적용하면, 제거된 구조로 저장된다', async () => {
    const user = userEvent.setup();
    await renderOpened(analysis);

    const removeButtons = screen.getAllByTitle('이 항목 제거');
    await user.click(removeButtons[1]); // 하위 항목(단순 연결 리스트) 제거

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(7, expect.objectContaining({
      topics: [expect.objectContaining({ title: '연결 리스트', children: [] })],
    }));
  });

  it('제목을 고치면 sourceType은 그대로 유지된다(제목 수정과 근거 상실은 다른 일이다)', async () => {
    const user = userEvent.setup();
    await renderOpened(analysis);

    const titleInput = screen.getByDisplayValue('연결 리스트');
    await user.clear(titleInput);
    await user.type(titleInput, '이중 연결 리스트');

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(7, expect.objectContaining({
      topics: [expect.objectContaining({ title: '이중 연결 리스트', sourceType: 'SOURCE', sourceLocator: '3장' })],
    }));
  });

  it('최상위 항목을 추가하면 원문 근거가 없으므로 AI 세분화로 표시한다(provenance 보존)', async () => {
    const user = userEvent.setup();
    await renderOpened(analysis);

    expect(screen.queryByText('AI 세분화')).not.toBeInTheDocument(); // 기존 두 항목은 모두 SOURCE

    await user.click(screen.getByRole('button', { name: /최상위 항목 추가/ }));

    expect(screen.getByText('AI 세분화')).toBeInTheDocument();
  });

  it('교재명을 입력하면 적용 시 courseFields에 반영된다', async () => {
    const user = userEvent.setup();
    await renderOpened(analysis);

    const textbookInput = screen.getAllByPlaceholderText('미확인')[0];
    await user.type(textbookInput, '자료구조와 함께 배우는 알고리즘');

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(7, expect.objectContaining({
      courseFields: expect.objectContaining({ textbookTitle: '자료구조와 함께 배우는 알고리즘' }),
    }));
  });

  /*
   * 기본이 접힘인 것 자체가 요구사항이다. 펼친 채로 두면 학습 내용 수십 항목이 프로젝트
   * 화면을 통째로 밀어낸다. 다만 접기가 "숨기기"가 되면 안 되므로, 접힌 상태에서도 항목
   * 수와 적용/폐기는 남아 있어야 한다.
   */
  it('기본은 접혀 있고, 접힌 상태에서도 개수와 적용·폐기는 보인다', () => {
    render(<MaterialReview analysis={analysis} onApplied={vi.fn()} onDismiss={vi.fn()} />);

    expect(screen.getByRole('button', { name: /구조 분석 결과/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByPlaceholderText('항목 제목')).not.toBeInTheDocument();
    expect(screen.getByText(/학습 내용 \d+개/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /적용/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '폐기' })).toBeInTheDocument();
  });

  it('펼치면 학습 내용 입력이 나타난다', async () => {
    await renderOpened(analysis);

    expect(screen.getByRole('button', { name: /구조 분석 결과/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByPlaceholderText('항목 제목').length).toBeGreaterThan(0);
  });

  it('적용을 누르면 edit 저장 이후 apply가 호출되고 onApplied가 불린다', async () => {
    const user = userEvent.setup();
    const onApplied = vi.fn();
    render(<MaterialReview analysis={analysis} onApplied={onApplied} onDismiss={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit.mock.invocationCallOrder[0])
      .toBeLessThan(materialAnalysisAPI.apply.mock.invocationCallOrder[0]);
    expect(materialAnalysisAPI.apply).toHaveBeenCalledWith(7);
    expect(onApplied).toHaveBeenCalled();
  });
});

describe('MaterialReview - 과목 정보/평가 정보 분류 표시', () => {
  const analysisWithNotes = {
    analysisId: 8,
    status: 'DRAFT',
    payload: {
      summary: '분석 완료',
      courseFields: { textbookTitle: null, textbookAuthor: null, textbookPublisher: null, textbookIsbn: null },
      courseNotes: [
        { category: 'COURSE_INFO', label: '담당교수', detail: '홍길동 교수' },
        { category: 'ASSESSMENT', label: '평가 비율', detail: '중간 30% · 기말 30%' },
      ],
      keyDates: [],
      topics: [
        { title: '연결 리스트', sourceType: 'SOURCE', sourceLocator: '3장', children: [] },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    materialAnalysisAPI.edit.mockResolvedValue({});
    materialAnalysisAPI.apply.mockResolvedValue({});
  });

  it('학습 내용과 분리해 과목 정보/평가 정보를 카테고리별로 보여준다 — Apply 전에 무엇이 확정될지 알 수 있다', async () => {
    await renderOpened(analysisWithNotes);

    expect(screen.getByText('과목 정보')).toBeInTheDocument();
    expect(screen.getByText('평가/일정')).toBeInTheDocument();
    expect(screen.getByText('담당교수')).toBeInTheDocument();
    expect(screen.getByText('홍길동 교수')).toBeInTheDocument();
    expect(screen.getByText('평가 비율')).toBeInTheDocument();
    // 학습 내용(topics)과는 구분된 섹션이다.
    expect(screen.getByText('학습 내용')).toBeInTheDocument();
    expect(screen.getByDisplayValue('연결 리스트')).toBeInTheDocument();
  });

  it('과목 정보/평가 정보는 이 화면에서 편집하지 않지만, 적용 시 그대로 함께 저장된다', async () => {
    const user = userEvent.setup();
    await renderOpened(analysisWithNotes);

    await user.click(screen.getByRole('button', { name: '검토 완료 — 적용' }));

    expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(8, expect.objectContaining({
      courseNotes: analysisWithNotes.payload.courseNotes,
    }));
  });

  it('과목 정보/평가 정보가 없으면 해당 섹션을 보여주지 않는다', async () => {
    await renderOpened(analysis);

    expect(screen.queryByText('과목 정보')).not.toBeInTheDocument();
    expect(screen.queryByText('평가/일정')).not.toBeInTheDocument();
  });
  /*
   * 주차별 토픽이 없는 강의계획서는 드문 일이 아니다. 그때도 교재 정보와 과목 정보는
   * 뽑히고, 서버 apply는 그 상태를 이미 정상 처리한다 — 화면만 막고 있었다.
   */
  describe('학습 내용이 없어도 나머지는 적용할 수 있다', () => {
    const syllabusOnly = {
      analysisId: 7,
      status: 'DRAFT',
      payload: {
        summary: '주차별/주제별 학습 토픽은 제공되지 않습니다.',
        courseFields: {
          textbookTitle: 'NEW English Conversation Arts 1',
          textbookAuthor: 'Michael Putlack, 이현호',
          textbookPublisher: '형설출판사',
          textbookIsbn: null,
        },
        courseNotes: [
          { category: 'COURSE_INFO', label: '담당교수', detail: 'Stephen' },
          { category: 'ASSESSMENT', label: '성적평가 비율', detail: '중간 40%, 기말 40%, 출석 20%' },
        ],
        keyDates: [],
        topics: [],
      },
    };

    it('토픽이 0개여도 과목 정보가 있으면 적용할 수 있다', async () => {
      const user = userEvent.setup();
      const onApplied = vi.fn();
      render(<MaterialReview analysis={syllabusOnly} onApplied={onApplied} onDismiss={vi.fn()} />);

      const apply = screen.getByRole('button', { name: '검토 완료 — 적용' });
      expect(apply).toBeEnabled();

      await user.click(apply);

      // 서버는 topics가 비면 건너뛰고 courseNotes와 교재 정보를 저장한다.
      expect(materialAnalysisAPI.edit).toHaveBeenCalledWith(7, expect.objectContaining({
        topics: [],
        courseNotes: syllabusOnly.payload.courseNotes,
        courseFields: expect.objectContaining({ textbookTitle: 'NEW English Conversation Arts 1' }),
      }));
      expect(materialAnalysisAPI.apply).toHaveBeenCalledWith(7);
      expect(onApplied).toHaveBeenCalled();
    });

    it('과목 정보가 없어도 교재 정보만 있으면 적용할 수 있다', () => {
      render(
        <MaterialReview
          analysis={{
            ...syllabusOnly,
            payload: { ...syllabusOnly.payload, courseNotes: [] },
          }}
          onApplied={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: '검토 완료 — 적용' })).toBeEnabled();
    });

    it('정말 아무것도 없으면 잠그되, 왜 잠겼는지 말한다', () => {
      render(
        <MaterialReview
          analysis={{
            ...syllabusOnly,
            payload: {
              ...syllabusOnly.payload,
              courseFields: { textbookTitle: null, textbookAuthor: null, textbookPublisher: null, textbookIsbn: null },
              courseNotes: [],
            },
          }}
          onApplied={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );

      // 눌러도 아무 일이 없는 버튼은 사용자가 앱이 고장났다고 읽는다.
      expect(screen.getByRole('button', { name: '검토 완료 — 적용' })).toBeDisabled();
      expect(screen.getByText('적용할 내용이 없어요')).toBeInTheDocument();
    });
  });

});
