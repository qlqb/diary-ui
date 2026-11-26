/**
 * 프로젝트 연결 제안 창 — "AI 추천대로 한 번에, 틀린 것만 그 줄에서".
 *
 * 지키는 선
 * - 확신 있는 추천은 처음부터 켜져 있고 한 번에 연결된다. AI가 자신 없는 것은 고르기 전에는 넣지 않는다.
 * - 파일 하나만 다른 곳(기존·새 프로젝트)으로 보낼 수 있고, 그 파일만 요청에서 갈라진다.
 * - 새 프로젝트는 이름부터 정하고, 같은 이름의 기존 프로젝트가 있으면 거기에 넣기를 먼저 권한다.
 * - 여러 개를 한꺼번에 옮기는 것은 선택 모드에서만 한다(평소 체크는 "연결에 넣기").
 * - 판단하지 못한 자료를 숨기지 않는다. 실패·부족 계열 표현을 쓰지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProposalDialog from './ProposalDialog.jsx';
import { materialStoreAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  materialStoreAPI: { applyLinkProposal: vi.fn(), file: vi.fn() },
}));

const content = (materialId, originalFilename, materialType = 'PROFESSOR_SLIDE') => ({
  materialId, originalFilename, materialType, evidence: '센서활용프로그래밍', evidenceSource: 'CONTENT', evidenceVerified: true,
});

const PROJECTS = [
  { courseId: 3, title: '센서활용프로그래밍' },
  { courseId: 5, title: '네트워크프로그래밍' },
  { courseId: 6, title: '빅데이터분석' },
];

const proposal = (overrides = {}) => ({
  status: 'GENERATED',
  remainingMaterialIds: [],
  groups: [
    {
      groupId: 'g-sensor', action: 'LINK_EXISTING', existingCourseId: 3, existingCourseTitle: '센서활용프로그래밍',
      proposedTitle: null, reason: '첫 장에 과목명이 있어요', defaultSelected: true, notices: [], matchingProjects: [],
      members: [content(201, '2주차 .pdf'), content(202, '3주_1.pdf'), content(203, '11.코드리뷰와_TCP_데이터_전송.pdf')],
    },
    {
      groupId: 'g-embedded', action: 'CREATE_AND_LINK', existingCourseId: null, existingCourseTitle: null,
      proposedTitle: '임베디드 리눅스', reason: '파일명에 embedded가 있어요', defaultSelected: false, notices: [], matchingProjects: [],
      members: [{ materialId: 209, originalFilename: 'embedded_lab_guide.pdf', materialType: 'OTHER',
        evidence: 'embedded', evidenceSource: 'FILENAME_ONLY', evidenceVerified: false }],
    },
    {
      groupId: 'g-net', action: 'CREATE_AND_LINK', existingCourseId: null, existingCourseTitle: null,
      proposedTitle: '네트워크프로그래밍', reason: '', defaultSelected: false,
      notices: ['같은 이름의 프로젝트가 이미 있어요.'], matchingProjects: [{ courseId: 5, title: '네트워크프로그래밍' }],
      members: [content(210, '소켓_과제2_명세.pdf', 'OTHER')],
    },
    {
      groupId: 'leave', action: 'LEAVE', reason: '', defaultSelected: false, notices: [], matchingProjects: [],
      members: [{ materialId: 211, originalFilename: '스캔_0412.pdf', materialType: 'OTHER', evidence: '', evidenceSource: null, evidenceVerified: false }],
    },
  ],
  ...overrides,
});

/** 확인할 것이 없는 제안(센서 묶음만). */
const confidentOnly = () => proposal({ groups: proposal().groups.slice(0, 1) });

function renderDialog(p = proposal(), props = {}) {
  const onApplied = vi.fn();
  const onClose = vi.fn();
  render(<ProposalDialog proposal={p} projects={PROJECTS} onApplied={onApplied} onClose={onClose} {...props} />);
  return { onApplied, onClose };
}

const chip = (filename) => screen.getByRole('button', { name: new RegExp(`^${filename.replace(/[.()]/g, '\\$&')} 넣을 곳`) });
const applied = () => materialStoreAPI.applyLinkProposal.mock.calls[0][0];

describe('ProposalDialog — 추천대로 한 번에, 틀린 것만 그 줄에서', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialStoreAPI.applyLinkProposal.mockResolvedValue({ createdProjects: [], linkedMaterialCount: 0 });
  });

  it('확인할 것이 없으면 추천대로 한 번에 연결한다', async () => {
    const user = userEvent.setup();
    const { onApplied } = renderDialog(confidentOnly());

    await user.click(screen.getByRole('button', { name: '추천대로 3개 연결' }));

    expect(applied()).toEqual([{
      action: 'LINK_EXISTING', existingCourseId: 3,
      members: [
        { materialId: 201, materialType: 'PROFESSOR_SLIDE' },
        { materialId: 202, materialType: 'PROFESSOR_SLIDE' },
        { materialId: 203, materialType: 'PROFESSOR_SLIDE' },
      ],
    }]);
    expect(onApplied).toHaveBeenCalled();
  });

  it('맨 위 요약이 어디로 몇 개 가는지와 확인 필요·그냥 둠을 보여 준다', () => {
    renderDialog();
    const summary = screen.getByLabelText('연결 요약');
    expect(within(summary).getByText('센서활용프로그래밍')).toBeInTheDocument();
    expect(within(summary).getByText(/확인 필요/)).toHaveTextContent('2');
    expect(within(summary).getByText(/그냥 둠/)).toHaveTextContent('1');
  });

  it('AI가 자신 없는 자료는 위에 따로 모이고, 고르기 전에는 연결에 넣지 않는다', async () => {
    const user = userEvent.setup();
    renderDialog();

    const reviewBox = screen.getByRole('region', { name: '확인해 주세요' });
    expect(within(reviewBox).getByText('파일명만 보고 고른 곳이에요')).toBeInTheDocument();
    // 같은 이름의 기존 프로젝트가 있으면 새로 만들기보다 그쪽이 추천이다.
    expect(chip('소켓_과제2_명세.pdf')).toHaveTextContent('네트워크프로그래밍');

    await user.click(screen.getByRole('button', { name: '3개 연결하기' }));
    expect(applied()).toHaveLength(1);
    expect(applied()[0].existingCourseId).toBe(3);
  });

  it('[추천대로]를 누른 확인 자료만 함께 연결된다 — 같은 이름이면 기존 프로젝트로', async () => {
    const user = userEvent.setup();
    renderDialog();

    const reviewBox = screen.getByRole('region', { name: '확인해 주세요' });
    await user.click(within(reviewBox).getAllByRole('button', { name: '추천대로' })[1]);
    await user.click(screen.getByRole('button', { name: '4개 연결하기' }));

    expect(applied()).toContainEqual({
      action: 'LINK_EXISTING', existingCourseId: 5, members: [{ materialId: 210, materialType: 'OTHER' }],
    });
  });

  it('파일 하나만 다른 기존 프로젝트로 옮기면 그 파일만 갈라져 나간다', async () => {
    const user = userEvent.setup();
    renderDialog(confidentOnly());

    await user.click(chip('11.코드리뷰와_TCP_데이터_전송.pdf'));
    await user.click(await screen.findByRole('menuitem', { name: '네트워크프로그래밍' }));

    // 그 줄은 제자리에 남고 무엇에서 바꿨는지 보인다.
    expect(screen.getByText(/AI 추천: 센서활용프로그래밍/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '3개 연결하기' }));
    expect(applied()).toEqual([
      { action: 'LINK_EXISTING', existingCourseId: 3, members: [
        { materialId: 201, materialType: 'PROFESSOR_SLIDE' }, { materialId: 202, materialType: 'PROFESSOR_SLIDE' }] },
      { action: 'LINK_EXISTING', existingCourseId: 5, members: [{ materialId: 203, materialType: 'PROFESSOR_SLIDE' }] },
    ]);
  });

  it('바꾼 것은 그 줄의 [되돌리기]로 AI 추천으로 돌아간다', async () => {
    const user = userEvent.setup();
    renderDialog(confidentOnly());

    await user.click(chip('2주차 .pdf'));
    await user.click(await screen.findByRole('menuitem', { name: '빅데이터분석' }));
    await user.click(screen.getByRole('button', { name: /되돌리기/ }));

    await user.click(screen.getByRole('button', { name: '추천대로 3개 연결' }));
    expect(applied()).toHaveLength(1);
  });

  it('새 프로젝트는 메뉴 안에서 이름부터 정한다 — 기본 이름은 번호·확장자를 뗀 파일명', async () => {
    const user = userEvent.setup();
    renderDialog(confidentOnly());

    await user.click(chip('11.코드리뷰와_TCP_데이터_전송.pdf'));
    await user.click(await screen.findByRole('menuitem', { name: '새 프로젝트 만들기…' }));
    const name = await screen.findByLabelText('새 프로젝트 이름');
    expect(name).toHaveValue('코드리뷰와 TCP 데이터 전송');

    await user.clear(name);
    await user.type(name, 'TCP 소켓 실습{Enter}');

    expect(screen.getByRole('button', { name: /새 프로젝트 TCP 소켓 실습 고치기/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '3개 연결하기' }));
    expect(applied()).toContainEqual({
      action: 'CREATE_AND_LINK', title: 'TCP 소켓 실습', members: [{ materialId: 203, materialType: 'PROFESSOR_SLIDE' }],
    });
  });

  it('같은 이름의 기존 프로젝트를 적으면 새로 만들기보다 거기에 넣기를 먼저 권한다', async () => {
    const user = userEvent.setup();
    renderDialog(confidentOnly());

    await user.click(chip('2주차 .pdf'));
    await user.click(await screen.findByRole('menuitem', { name: '새 프로젝트 만들기…' }));
    const name = await screen.findByLabelText('새 프로젝트 이름');
    await user.clear(name);
    await user.type(name, '네트워크 프로그래밍');

    expect(screen.getByText(/이미 있어요/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '거기에 넣기' }));
    await user.click(screen.getByRole('button', { name: '3개 연결하기' }));
    expect(applied()).toContainEqual({
      action: 'LINK_EXISTING', existingCourseId: 5, members: [{ materialId: 201, materialType: 'PROFESSOR_SLIDE' }],
    });
    expect(applied().some((g) => g.action === 'CREATE_AND_LINK')).toBe(false);
  });

  it('여러 개 고르기 → 새 프로젝트로 묶기', async () => {
    const user = userEvent.setup();
    renderDialog(confidentOnly());

    await user.click(screen.getByRole('button', { name: '여러 개 고르기' }));
    await user.click(screen.getByRole('checkbox', { name: '2주차 .pdf 고르기' }));
    await user.click(screen.getByRole('checkbox', { name: '3주_1.pdf 고르기' }));
    await user.click(screen.getByRole('button', { name: '넣을 곳 바꾸기' }));
    await user.click(await screen.findByRole('menuitem', { name: '새 프로젝트로 묶기…' }));
    // 이름으로 쓸 말이 없는 파일명들이라 기본값을 비워 둔다.
    const name = await screen.findByLabelText('고른 2개를 넣을 새 프로젝트');
    expect(name).toHaveValue('');
    expect(screen.getByRole('button', { name: '2개 묶어 만들기' })).toBeDisabled();

    await user.type(name, '센서 실습');
    await user.click(screen.getByRole('button', { name: '2개 묶어 만들기' }));
    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.click(screen.getByRole('button', { name: '3개 연결하기' }));

    expect(applied()).toContainEqual({
      action: 'CREATE_AND_LINK', title: '센서 실습', members: [
        { materialId: 201, materialType: 'PROFESSOR_SLIDE' }, { materialId: 202, materialType: 'PROFESSOR_SLIDE' }],
    });
  });

  it('선택 모드에서 여러 개를 기존 프로젝트로도 옮긴다', async () => {
    const user = userEvent.setup();
    renderDialog(confidentOnly());

    await user.click(screen.getByRole('button', { name: '여러 개 고르기' }));
    await user.click(screen.getByRole('checkbox', { name: '2주차 .pdf 고르기' }));
    await user.click(screen.getByRole('checkbox', { name: '3주_1.pdf 고르기' }));
    await user.click(screen.getByRole('button', { name: '넣을 곳 바꾸기' }));
    await user.click(await screen.findByRole('menuitem', { name: '빅데이터분석' }));
    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.click(screen.getByRole('button', { name: '3개 연결하기' }));

    expect(applied()).toContainEqual(expect.objectContaining({ action: 'LINK_EXISTING', existingCourseId: 6 }));
  });

  it('요약의 새 프로젝트 칩에서 취소하면 그 자료들은 AI 추천으로 돌아간다', async () => {
    const user = userEvent.setup();
    renderDialog(confidentOnly());

    await user.click(chip('2주차 .pdf'));
    await user.click(await screen.findByRole('menuitem', { name: '새 프로젝트 만들기…' }));
    const name = await screen.findByLabelText('새 프로젝트 이름');
    await user.type(name, '임시{Enter}');
    await user.click(screen.getByRole('button', { name: /새 프로젝트 임시 고치기/ }));
    await user.click(await screen.findByRole('button', { name: '이 새 프로젝트 취소' }));

    await user.click(screen.getByRole('button', { name: '추천대로 3개 연결' }));
    expect(applied()).toHaveLength(1);
  });

  it('새 프로젝트 이름을 비우면 연결할 수 없고 이유를 말한다', async () => {
    const user = userEvent.setup();
    renderDialog(confidentOnly());

    await user.click(chip('2주차 .pdf'));
    await user.click(await screen.findByRole('menuitem', { name: '새 프로젝트 만들기…' }));
    await user.type(await screen.findByLabelText('새 프로젝트 이름'), '임시{Enter}');
    await user.click(screen.getByRole('button', { name: /새 프로젝트 임시 고치기/ }));
    await user.clear(await screen.findByDisplayValue('임시'));

    expect(screen.getByRole('button', { name: '3개 연결하기' })).toBeDisabled();
    expect(screen.getByText(/이름이 빈 새 프로젝트가 있어요/)).toBeInTheDocument();
  });

  it('판단하지 못한 자료를 숨기지 않는다 — 접힌 칸으로 보여 준다', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByText('스캔_0412.pdf')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /지금은 그냥 둘 자료 1개/ }));
    expect(screen.getByText('스캔_0412.pdf')).toBeInTheDocument();
  });

  it('[남은 N개 보기]로 남은 자료를 넘긴다', async () => {
    const user = userEvent.setup();
    const onShowRemaining = vi.fn();
    renderDialog(proposal({ remainingMaterialIds: [300, 301] }), { onShowRemaining });

    await user.click(screen.getByRole('button', { name: '남은 2개 보기' }));
    expect(onShowRemaining).toHaveBeenCalledWith([300, 301]);
  });

  it('Esc로 닫히지만, 이름을 적는 중의 Esc는 창을 닫지 않는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog(confidentOnly());

    await user.click(chip('2주차 .pdf'));
    await user.click(await screen.findByRole('menuitem', { name: '새 프로젝트 만들기…' }));
    await screen.findByLabelText('새 프로젝트 이름');
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    screen.getByRole('heading', { name: /프로젝트 연결 제안/ }).focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('연결하지 못하면 창을 닫지 않고 이유를 보인다', async () => {
    const user = userEvent.setup();
    materialStoreAPI.applyLinkProposal.mockRejectedValue(new Error('이미 다른 곳에 연결된 자료가 있어요.'));
    const { onApplied } = renderDialog(confidentOnly());

    await user.click(screen.getByRole('button', { name: '추천대로 3개 연결' }));
    expect(await screen.findByText('이미 다른 곳에 연결된 자료가 있어요.')).toBeInTheDocument();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('문구에 실패·부족 계열 표현을 쓰지 않는다', () => {
    renderDialog();
    expect(screen.getByRole('dialog').textContent).not.toMatch(/실패|오류|에러|부족|미완료|잘못/);
  });
});
