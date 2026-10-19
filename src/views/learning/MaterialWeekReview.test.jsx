import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/api.js', () => ({
  materialWeekAPI: { review: vi.fn(), place: vi.fn(), applySuggestions: vi.fn() },
}));

import MaterialWeekReview from './MaterialWeekReview.jsx';
import { materialWeekAPI } from '../../api/api.js';

const suggestion = (placement, week, confidence, evidence = []) => ({
  placement, week, confidence, bulkApplicable: confidence === 'HIGH' || confidence === 'MEDIUM',
  options: placement ? [{ placement, week }] : [], evidence,
});

const item = (materialId, filename, { assignment = null, s = null, differs = false, state = 'DONE' } = {}) => ({
  materialId, filename, materialType: 'PROFESSOR_SLIDE', analysisState: state, assignment, suggestion: s,
  suggestionDiffers: differs,
});

function review(items, needsReview = items.filter((i) => !i.assignment).length) {
  return { courseId: 7, courseTitle: '네트워크프로그래밍', weekCount: 15, needsReview, items };
}

const AWS_EVIDENCE = [
  { kind: 'DOCUMENT_TITLE_WEEK', detail: '파일 속성 제목: "AWS 구성하기 + SSH 실습 (네트워크프로그래밍 3주차)"' },
  { kind: 'FILENAME_NUMBER', detail: '파일명 순번: 3.' },
];

const network = () => review([
  item(1, '01.수업소개_네트워크프로그래밍.pdf', { s: suggestion('WEEK', 1, 'MEDIUM') }),
  item(3, '3.AWS_구성하기_SSH실습.pdf', { s: suggestion('WEEK', 3, 'HIGH', AWS_EVIDENCE) }),
  item(4, '네트워크프로그래밍.pdf', { s: suggestion('COURSE_WIDE', null, 'HIGH') }),
  item(5, 'MySQL실습스크립트.sh', { s: suggestion('WEEK', 3, 'LOW') }),
  item(6, '2주차_AWS.pdf', { s: { placement: null, week: null, confidence: 'CONFLICT', bulkApplicable: false,
    options: [{ placement: 'WEEK', week: 2 }, { placement: 'WEEK', week: 3 }], evidence: [] } }),
]);

const region = (name) => screen.getByRole('region', { name: new RegExp(`^${name} \\(`) });
const card = (filename) => screen.getByText(filename).closest('li');

beforeEach(() => {
  vi.clearAllMocks();
  materialWeekAPI.review.mockResolvedValue(network());
});

describe('MaterialWeekReview', () => {
  it('한 화면에서 주차별로 보여 준다 — 추천은 그 칸에 "AI 추천", 약한 추천·충돌은 미분류, 강의계획서는 전체 참고', async () => {
    render(<MaterialWeekReview courseId={7} onClose={vi.fn()} />);

    expect(await screen.findByRole('dialog', { name: '자료 주차 확인' })).toBeInTheDocument();
    expect(within(region('3주차')).getByText('3.AWS_구성하기_SSH실습.pdf')).toBeInTheDocument();
    expect(within(region('3주차')).getByText('3주차 · AI 추천')).toBeInTheDocument();
    expect(within(region('전체 참고자료')).getByText('네트워크프로그래밍.pdf')).toBeInTheDocument();
    const unassigned = region('미분류');
    expect(within(unassigned).getByText('약한 추천: 3주차')).toBeInTheDocument();
    expect(within(unassigned).getByText('확인 필요: 2주차 또는 3주차')).toBeInTheDocument();
    // 15주차까지 칸이 있고, 빈 칸도 놓을 자리로 보인다.
    expect(region('15주차')).toBeInTheDocument();
    expect(screen.getByText('확인 필요 5개')).toBeInTheDocument();
  });

  it('끌어 놓으면 그 주차로 저장되고, 다시 열어도 그 주차에 있다', async () => {
    const moved = review([
      item(3, '3.AWS_구성하기_SSH실습.pdf', { assignment: { placement: 'WEEK', weeks: [2], source: 'USER' },
        s: suggestion('WEEK', 3, 'HIGH'), differs: true }),
    ]);
    materialWeekAPI.place.mockResolvedValue(moved);
    const onChanged = vi.fn();
    const { unmount } = render(<MaterialWeekReview courseId={7} onClose={vi.fn()} onChanged={onChanged} />);
    await screen.findByText('3.AWS_구성하기_SSH실습.pdf');

    const data = { setData: vi.fn(), getData: vi.fn(() => ''), effectAllowed: null };
    fireEvent.dragStart(card('3.AWS_구성하기_SSH실습.pdf'), { dataTransfer: data });
    fireEvent.dragOver(region('2주차'), { dataTransfer: data });
    fireEvent.drop(region('2주차'), { dataTransfer: data });

    await waitFor(() => expect(materialWeekAPI.place).toHaveBeenCalledWith(7, 3,
      { placement: 'WEEK', weeks: [2], source: 'USER' }));
    expect(await within(region('2주차')).findByText('2주차 · 직접 지정')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    // 확정과 다른 새 추천은 알리기만 한다.
    expect(screen.getByText(/새 분석은 3주차 을\(를\) 추천해요/)).toBeInTheDocument();

    // "새로고침": 서버가 저장한 것을 다시 읽는다.
    unmount();
    materialWeekAPI.review.mockResolvedValue(moved);
    render(<MaterialWeekReview courseId={7} onClose={vi.fn()} />);
    expect(await within(await screen.findByRole('region', { name: /^2주차 \(/ })).findByText('3.AWS_구성하기_SSH실습.pdf'))
      .toBeInTheDocument();
  });

  it('끌기가 안 되는 환경에서도 선택 상자로 옮길 수 있다', async () => {
    const user = userEvent.setup();
    materialWeekAPI.place.mockResolvedValue(network());
    render(<MaterialWeekReview courseId={7} onClose={vi.fn()} />);
    await screen.findByText('MySQL실습스크립트.sh');

    await user.selectOptions(screen.getByRole('combobox', { name: 'MySQL실습스크립트.sh을(를) 놓을 자리' }), 'w3');

    // 약한 추천을 그 추천 주차로 고른 것은 추천 확인이다.
    expect(materialWeekAPI.place).toHaveBeenCalledWith(7, 5, { placement: 'WEEK', weeks: [3], source: 'SUGGESTION' });
  });

  it('추천대로 적용은 HIGH·MEDIUM 추천만 보낸다 — 충돌·약한 추천은 남긴다', async () => {
    const user = userEvent.setup();
    materialWeekAPI.applySuggestions.mockResolvedValue({ applied: 3, skipped: [], review: network() });
    render(<MaterialWeekReview courseId={7} onClose={vi.fn()} />);
    await screen.findByText('3.AWS_구성하기_SSH실습.pdf');

    await user.click(screen.getByRole('button', { name: '추천대로 적용 (3)' }));

    expect(materialWeekAPI.applySuggestions).toHaveBeenCalledWith(7, [
      { materialId: 1, placement: 'WEEK', week: 1 },
      { materialId: 3, placement: 'WEEK', week: 3 },
      { materialId: 4, placement: 'COURSE_WIDE', week: null },
    ]);
    expect(await screen.findByText('3개를 추천대로 적용했어요.')).toBeInTheDocument();
  });

  it('충돌은 후보 중 하나로 확인하고, 근거가 없으면 주차 없음으로 둘 수 있다', async () => {
    const user = userEvent.setup();
    materialWeekAPI.place.mockResolvedValue(network());
    render(<MaterialWeekReview courseId={7} onClose={vi.fn()} />);
    await screen.findByText('2주차_AWS.pdf');
    const conflict = card('2주차_AWS.pdf');

    await user.click(within(conflict).getByRole('button', { name: '3주차로 확인' }));
    expect(materialWeekAPI.place).toHaveBeenLastCalledWith(7, 6, { placement: 'WEEK', weeks: [3], source: 'SUGGESTION' });

    await user.click(within(card('2주차_AWS.pdf')).getByRole('button', { name: '주차 없음으로 두기' }));
    expect(materialWeekAPI.place).toHaveBeenLastCalledWith(7, 6, { placement: 'UNASSIGNED', weeks: [], source: 'USER' });
  });

  it('추천 이유는 열었을 때만 근거 신호로 보인다', async () => {
    const user = userEvent.setup();
    render(<MaterialWeekReview courseId={7} onClose={vi.fn()} />);
    await screen.findByText('3.AWS_구성하기_SSH실습.pdf');
    const aws = card('3.AWS_구성하기_SSH실습.pdf');
    expect(screen.queryByText(/네트워크프로그래밍 3주차/)).not.toBeInTheDocument();

    await user.click(within(aws).getByRole('button', { name: '추천 이유 보기' }));

    const list = within(aws).getByRole('list', { name: /추천 이유/ });
    expect(within(list).getByText(/네트워크프로그래밍 3주차/)).toBeInTheDocument();
    expect(within(list).getByText('파일 속성 제목')).toBeInTheDocument();
  });

  it('그 사이 추천이 바뀌어 거절되면 다시 읽고 알린다', async () => {
    const user = userEvent.setup();
    const stale = Object.assign(new Error('요청 실패: 409'), { status: 409, code: 'E409_036' });
    materialWeekAPI.place.mockRejectedValue(stale);
    render(<MaterialWeekReview courseId={7} onClose={vi.fn()} />);
    await screen.findByText('3.AWS_구성하기_SSH실습.pdf');
    const aws = card('3.AWS_구성하기_SSH실습.pdf');

    await user.click(within(aws).getByRole('button', { name: '확인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('그 사이 주차 추천이 바뀌었어요');
    expect(materialWeekAPI.review).toHaveBeenCalledTimes(2);
  });

  it('분석이 도는 중인 자료는 추천이 바뀔 수 있다고 적는다', async () => {
    materialWeekAPI.review.mockResolvedValue(review([item(9, 'new.pdf', { state: 'RUNNING' })], 0));
    render(<MaterialWeekReview courseId={7} onClose={vi.fn()} />);

    expect(await screen.findByText('분석 중 · 추천이 바뀔 수 있어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '추천대로 적용' })).toBeDisabled();
  });

  it('나중에·Esc로 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MaterialWeekReview courseId={7} onClose={onClose} />);
    await screen.findByText('3.AWS_구성하기_SSH실습.pdf');

    await user.click(screen.getByRole('button', { name: '나중에' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
