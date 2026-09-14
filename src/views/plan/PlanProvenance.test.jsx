import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanDraftReview from './PlanDraftReview.jsx';
import ExecutionItemEvidence from './ExecutionItemEvidence.jsx';
import { forgetItemEvidence } from '../../lib/evidenceCache.js';
import { materialStoreAPI, planAPI, schedulePreviewAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  planAPI: {
    createDraft: vi.fn(), confirm: vi.fn(), findCoveringDate: vi.fn(), regenerateItems: vi.fn(),
    draftProvenance: vi.fn(), itemProvenance: vi.fn(),
  },
  schedulePreviewAPI: { get: vi.fn(), recompute: vi.fn() },
  topicAPI: { updateUserMark: vi.fn() },
  materialStoreAPI: { file: vi.fn() },
}));

/**
 * 여기서 증명하려는 것은 두 가지다.
 *
 * 1. <b>세 가지가 화면에서 서로 다른 것으로 보인다</b> — 등록한 일정(원본 정보)과 서버가
 *    계산한 남는 시간과 AI가 적어 낸 예상 시간이 한 덩어리로 보이면, 사용자는 추정을 확정된
 *    사실로 읽는다. 출처가 붙어 있다는 이유로 "확인됐다"고 말하지 않는 것도 같은 이유다.
 * 2. <b>근거를 짧게 확인하고 원문을 바로 연다</b> — 학습 항목 4~5개가 같은 자료면 범위 묶음
 *    하나와 열기 액션 하나, 원문을 열어도 검토 상태는 그대로, 개별 인용은 상세에 남는다.
 */
const PDF = {
  materialId: 657, recordedMaterialId: 657, filename: '네트워크 2주차.pdf', currentFilename: '네트워크 2주차.pdf',
  contentType: 'application/pdf', locator: '2주차', origin: 'RECORDED', state: 'AVAILABLE',
  openMode: 'INLINE', note: null,
};

const topicSource = (refId, sourceId, title, parentSourceId = null, material = PDF) => ({
  refId, sourceType: 'TOPIC', sourceId, parentSourceId, representation: 'SELECTED_FIELDS',
  providedValue: { courseId: 6, title, sourceLocator: '2주차' },
  promptLine: `  - ${title} (2주차) [${refId}]`,
  link: { available: true, target: 'TOPIC', targetId: sourceId, unavailableReason: null },
  material,
});

const PROVENANCE = {
  recorded: true,
  schemaVersion: 2,
  proposalId: 77,
  generationId: 'gen-1',
  capturedAt: '2026-09-10T15:00:00',
  timezone: 'Asia/Seoul',
  startDate: '2026-09-10',
  endDate: '2026-09-13',
  generator: 'AI',
  modelName: 'test-model',
  providedSources: [
    {
      refId: 's1', sourceType: 'COURSE', sourceId: 6, representation: 'SELECTED_FIELDS',
      providedValue: { title: '네트워크프로그래밍' }, promptLine: '- id=6 네트워크프로그래밍 [s1]',
      link: { available: true, target: 'COURSE', targetId: 6, unavailableReason: null },
    },
    topicSource('s2', 101, '네트워크와 소켓 프로그래밍'),
    topicSource('s3', 102, 'TCP/IP 프로토콜의 개요', 101),
    topicSource('s4', 103, '소켓의 개념', 101),
    topicSource('s5', 104, '소켓의 특징과 구조', 101),
    {
      refId: 's6', sourceType: 'COMMITMENT', sourceId: 17, representation: 'SELECTED_FIELDS',
      providedValue: { label: '근무' }, promptLine: '9/11 목 18:00~23:00 근무 [s6]',
      link: { available: true, target: 'COMMITMENT', targetId: 17, unavailableReason: null },
    },
  ],
  serverCalculations: [
    {
      calculationId: 'calc-1', kind: 'AVAILABILITY_ESTIMATE', providedToModel: true,
      inputRefIds: ['s6'], inputLineage: 'PARTIAL', lineageNote: '기본 창은 서버 상수다',
      result: { availableMinutes: 925, confidenceSummary: '기본 시간대를 사용한 추정' },
    },
  ],
  items: [
    {
      proposalItemId: 1,
      title: '네트워크 · 소켓 복습',
      recorded: true,
      generationId: 'gen-1',
      refIds: ['s2', 's3', 's4', 's5'],
      reason: '핵심 개념 4개와 코드 실행 흐름을 정리하는 복습으로 구성',
      aiEstimates: ['예상 소요 시간 40분'],
      serverCalculationIds: [],
      evidenceStatus: 'CURRENT',
      staleReasons: [],
      unknownRefCount: 1,
      afterApplyChanges: [],
    },
  ],
};

const DRAFT = {
  proposalId: 77,
  startDate: '2026-09-10',
  endDate: '2026-09-13',
  days: 4,
  intensity: 'NORMAL',
  targetMinutes: 600,
  estimatedAvailableMinutes: 925,
  noAvailableTime: false,
  suggestedTitle: '이번 주 계획',
  strategy: null,
  proposal: {
    proposalId: 77,
    items: [{
      proposalItemId: 1, topicId: 101, courseId: 6, title: '네트워크 · 소켓 복습',
      expectedMinutes: 40, priority: 'MUST', placementType: 'UNSCHEDULED', targetDate: null,
      reason: '핵심 개념 4개와 코드 실행 흐름을 정리하는 복습으로 구성',
    }],
  },
};

const withItem = (patch) => ({ ...PROVENANCE, items: [{ ...PROVENANCE.items[0], ...patch }] });
const withMaterial = (patch) => ({
  ...PROVENANCE,
  providedSources: PROVENANCE.providedSources.map((s) => (
    s.sourceType === 'TOPIC' ? { ...s, material: { ...PDF, ...patch } } : s)),
});

beforeEach(() => {
  vi.clearAllMocks();
  forgetItemEvidence();
  schedulePreviewAPI.get.mockResolvedValue(null);
  schedulePreviewAPI.recompute.mockResolvedValue({ placedItems: [], unplacedItems: [] });
  planAPI.draftProvenance.mockResolvedValue(PROVENANCE);
  planAPI.itemProvenance.mockResolvedValue({ ...PROVENANCE, planVersionId: 9 });
  materialStoreAPI.file.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openEvidence(user) {
  render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" projectTitles={{ 6: '네트워크프로그래밍' }} onOpenSource={vi.fn()} />);
  await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalledWith(77));
  await user.click(screen.getByRole('button', { name: /근거 보기/ }));
}

describe('생성 시 참고한 정보', () => {
  it('접혀 있다가 열리고, 준 정보와 서버 계산을 나눠서 보여준다', async () => {
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalledWith(77));
    // 접혀 있는 동안에는 본문이 없다 — 훑어보는 화면의 무게중심을 옮기지 않는다.
    expect(screen.queryByText(/근무/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /생성 시 참고한 정보/ }));

    expect(screen.getByText(/9\/11 목 18:00~23:00 근무/)).toBeInTheDocument();
    // 인용 번호는 AI에게 준 표식이지 사용자에게 보일 값이 아니다.
    expect(screen.queryByText(/\[s1\]/)).not.toBeInTheDocument();
    // 남는 시간은 "준 정보"가 아니라 "서버가 계산한 것"으로 따로 선다.
    expect(screen.getByText('서버가 계산한 것')).toBeInTheDocument();
    expect(screen.getByText(/남는 시간 약 925분/)).toBeInTheDocument();
    // 확인됐다고 말하지 않는다.
    expect(screen.getByText(/모두 그대로 반영된다는 뜻은 아니에요/)).toBeInTheDocument();
    // "생성 당시 값" 설명은 패널에 한 번이다. 줄마다 반복하지 않는다.
    expect(screen.getAllByText(/생성 당시 값/)).toHaveLength(1);
  });

  it('출처 기록이 없는 초안은 없다고 말한다 — 지금 DB로 채워 넣지 않는다', async () => {
    planAPI.draftProvenance.mockResolvedValue({ recorded: false, items: [] });
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /생성 시 참고한 정보/ }));

    expect(screen.getByText(/생성 당시 출처 기록이 없어요/)).toBeInTheDocument();
  });
});

describe('항목별 근거 — 짧게 확인하고 원문을 연다', () => {
  it('부모·하위 항목 4개가 같은 자료면 범위 묶음 하나와 열기 액션 하나로 보인다', async () => {
    const user = userEvent.setup();
    await openEvidence(user);

    const body = screen.getByText('학습 범위').closest('.plan-evidence-body');
    expect(within(body).getByText('네트워크프로그래밍 · 2주차')).toBeInTheDocument();
    expect(within(body).getByText('네트워크와 소켓 프로그래밍')).toBeInTheDocument();
    expect(within(body).getByText(/TCP\/IP 프로토콜의 개요, 소켓의 개념, 소켓의 특징과 구조/)).toBeInTheDocument();

    expect(within(body).getByText('참고 자료')).toBeInTheDocument();
    expect(within(body).getByText(/네트워크 2주차\.pdf/)).toBeInTheDocument();
    expect(within(body).getByText(/2주차 확인/)).toBeInTheDocument();
    // 열기 액션은 자료마다 하나. 학습 항목마다 반복하지 않는다.
    expect(within(body).getAllByRole('button', { name: /원본 자료 열기/ })).toHaveLength(1);
    // 직접 열 수 있으면 프로젝트로 가는 버튼은 기본 화면에 없다.
    expect(within(body).queryByRole('button', { name: /프로젝트 열기/ })).not.toBeInTheDocument();

    expect(within(body).getByText('AI의 제안')).toBeInTheDocument();
    expect(within(body).getByText(/핵심 개념 4개와 코드 실행 흐름/)).toBeInTheDocument();
    expect(within(body).getByText('예상 소요 시간 40분')).toBeInTheDocument();
    expect(within(body).getByText(/AI가 그렇게 봤다는 뜻이에요/)).toBeInTheDocument();
    // 없는 출처를 인용했다는 사실을 조용히 지우지 않는다.
    expect(within(body).getByText(/없던 출처 1건/)).toBeInTheDocument();
    // 기본 화면에는 내부 스크롤 영역이 없다. 상세만 스크롤한다.
    expect(body.querySelector('.plan-evidence-detail')).toBeNull();
  });

  it('개별 인용 줄은 상세에 남고, 닫으면 기본 화면이 그대로 있다', async () => {
    const user = userEvent.setup();
    await openEvidence(user);

    // 기본 화면에는 개별 줄이 없다 — 4번 반복되던 것이 묶음 하나가 됐다.
    expect(screen.queryByText('근거로 연결한 정보')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /생성 당시 정보 자세히 보기/ }));
    expect(screen.getByText('근거로 연결한 정보')).toBeInTheDocument();
    expect(screen.getByText(/^소켓의 개념 \(2주차\)$/)).toBeInTheDocument();
    expect(screen.getByText(/^소켓의 특징과 구조 \(2주차\)$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /생성 당시 정보 접기/ }));
    expect(screen.queryByText('근거로 연결한 정보')).not.toBeInTheDocument();
    expect(screen.getByText('학습 범위')).toBeInTheDocument();
  });

  it('두 번 클릭으로 원본을 열고, 돌아와도 제외·제목 상태가 그대로다', async () => {
    const tab = { location: null, opener: {}, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab);
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);
    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalled());

    // 검토 중인 상태를 만든다: 항목 제외, 제목 수정.
    await user.click(screen.getByRole('checkbox', { name: /네트워크 · 소켓 복습/ }));
    const title = screen.getByRole('textbox');
    await user.clear(title);
    await user.type(title, '소켓 주간');

    await user.click(screen.getByRole('button', { name: /근거 보기/ })); // 1
    await user.click(screen.getByRole('button', { name: /원본 자료 열기/ })); // 2

    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(materialStoreAPI.file).toHaveBeenCalledWith(657));
    await waitFor(() => expect(tab.location).toBe('blob:mock-url'));
    // 토큰은 주소에 붙지 않는다 — 인증 헤더로 받아 blob으로 연다.
    expect(tab.opener).toBeNull();

    // 돌아온 화면: 제외한 항목은 여전히 제외, 제목도 그대로, 근거도 열린 채다.
    expect(screen.getByRole('checkbox', { name: /네트워크 · 소켓 복습/ })).not.toBeChecked();
    expect(screen.getByRole('textbox')).toHaveValue('소켓 주간');
    expect(screen.getByText('학습 범위')).toBeInTheDocument();
  });

  it('원본이 변경된 자료는 그 사실을 기본 화면에서 말하고 현재 파일을 연다', async () => {
    planAPI.draftProvenance.mockResolvedValue(withMaterial({
      state: 'CHANGED', currentFilename: '네트워크 2주차(수정).pdf', note: '원본이 변경됨 · 현재 파일을 열어요',
    }));
    const user = userEvent.setup();
    await openEvidence(user);

    expect(screen.getByText(/원본이 변경됨/)).toBeInTheDocument();
    expect(screen.getByText(/지금 파일: 네트워크 2주차\(수정\)\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /원본 자료 열기/ })).toBeInTheDocument();
  });

  it('지워진 자료에는 열기 버튼이 없고 이유가 글로 보인다', async () => {
    planAPI.draftProvenance.mockResolvedValue(withMaterial({
      materialId: null, state: 'DELETED', openMode: 'NONE', note: '원본 자료가 지워졌어요',
    }));
    const user = userEvent.setup();
    await openEvidence(user);

    expect(screen.getByText(/원본 자료가 지워졌어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /원본 자료 열기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /파일 내려받기/ })).not.toBeInTheDocument();
    // 원문이 없을 때만 보조 경로로 프로젝트를 연다.
    expect(screen.getByRole('button', { name: /프로젝트 열기/ })).toBeInTheDocument();
  });

  it('브라우저가 그리지 못하는 파일은 "파일 내려받기"다', async () => {
    planAPI.draftProvenance.mockResolvedValue(withMaterial({
      filename: 'ch02.pptx', currentFilename: 'ch02.pptx', openMode: 'DOWNLOAD',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }));
    const user = userEvent.setup();
    await openEvidence(user);

    expect(screen.getByRole('button', { name: /파일 내려받기/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /원본 자료 열기/ })).not.toBeInTheDocument();
  });

  it('1판 스냅샷(연결 기록 없음)은 현재 연결된 자료라고 말한다', async () => {
    planAPI.draftProvenance.mockResolvedValue({
      ...withMaterial({ recordedMaterialId: null, origin: 'CURRENT_LINK', note: '생성 당시 연결 기록이 없어 현재 연결된 자료를 열어요' }),
      schemaVersion: 1,
    });
    const user = userEvent.setup();
    await openEvidence(user);

    expect(screen.getByText(/현재 연결된 자료 ·/)).toBeInTheDocument();
    expect(screen.getByText(/생성 당시 연결 기록이 없어/)).toBeInTheDocument();
  });

  it('자료가 많으면 두 묶음만 보이고 나머지는 개수와 함께 접혀 있다', async () => {
    const files = [
      { ...PDF, materialId: 1, recordedMaterialId: 1, filename: '1주차.pdf', currentFilename: '1주차.pdf', locator: '1주차' },
      { ...PDF, materialId: 2, recordedMaterialId: 2, filename: '2주차.pdf', currentFilename: '2주차.pdf', locator: '2주차' },
      { ...PDF, materialId: 3, recordedMaterialId: 3, filename: '3주차.pdf', currentFilename: '3주차.pdf', locator: '3주차' },
    ];
    planAPI.draftProvenance.mockResolvedValue({
      ...PROVENANCE,
      providedSources: [
        PROVENANCE.providedSources[0],
        topicSource('s2', 101, '재귀', null, files[0]),
        topicSource('s3', 102, '정렬', null, files[1]),
        topicSource('s4', 103, '탐색', null, files[2]),
      ],
      items: [{ ...PROVENANCE.items[0], refIds: ['s2', 's3', 's4'] }],
    });
    const user = userEvent.setup();
    await openEvidence(user);

    expect(screen.getAllByRole('button', { name: /원본 자료 열기/ })).toHaveLength(2);
    expect(screen.queryByText(/3주차\.pdf/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /자료 1개 더 보기/ }));
    expect(screen.getAllByRole('button', { name: /원본 자료 열기/ })).toHaveLength(3);
    expect(screen.getByText(/3주차\.pdf/)).toBeInTheDocument();
  });

  it('자료 연결이 없는 항목은 자료 없음을 말하고, 생활 일정만 참고한 항목은 학습 범위를 만들지 않는다', async () => {
    planAPI.draftProvenance.mockResolvedValue({
      ...PROVENANCE,
      providedSources: PROVENANCE.providedSources.map((s) => (s.sourceType === 'TOPIC' ? { ...s, material: null } : s)),
    });
    const user = userEvent.setup();
    await openEvidence(user);
    expect(screen.getByText('연결된 원본 자료가 없어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /프로젝트 열기/ })).toBeInTheDocument();
  });

  it('일정·조건만 참고한 항목은 "참고한 일정·조건"으로 보인다', async () => {
    planAPI.draftProvenance.mockResolvedValue(withItem({ refIds: ['s6'] }));
    const user = userEvent.setup();
    await openEvidence(user);

    expect(screen.queryByText('학습 범위')).not.toBeInTheDocument();
    expect(screen.getByText('참고한 일정·조건')).toBeInTheDocument();
    expect(screen.getByText(/9\/11 목 18:00~23:00 근무/)).toBeInTheDocument();
  });

  it('수정 전 제안의 근거라는 표식이 붙고, 이유는 기본 화면 맨 위에 보인다', async () => {
    planAPI.draftProvenance.mockResolvedValue(withItem({
      evidenceStatus: 'EDITED_BY_USER',
      staleReasons: ['확정할 때 내용이나 분량을 바꿨어요. 아래는 수정 전 제안의 근거예요.'],
    }));
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalled());
    expect(screen.getByText('수정 전 제안의 근거')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    expect(screen.getByText(/아래는 수정 전 제안의 근거예요/)).toBeInTheDocument();
  });

  it('기록 없음·요청 중·요청 실패는 서로 다르게 보인다', async () => {
    let resolveLoad;
    planAPI.draftProvenance.mockReturnValueOnce(new Promise((resolve) => { resolveLoad = resolve; }));
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    expect(await screen.findByText(/근거를 불러오는 중/)).toBeInTheDocument();
    expect(screen.queryByText(/근거 보기/)).not.toBeInTheDocument();

    resolveLoad({ recorded: false, items: [{ proposalItemId: 1, recorded: false, refIds: [] }] });
    await user.click(await screen.findByRole('button', { name: /근거 보기/ }));
    expect(screen.getByText(/생성 당시 근거 기록이 없어요/)).toBeInTheDocument();
  });

  it('요청이 안 되면 같은 자리에서 다시 시도한다', async () => {
    planAPI.draftProvenance.mockRejectedValueOnce(new Error('네트워크가 끊겼어요'));
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);

    expect(await screen.findByText(/근거를 불러오지 못했어요/)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /다시 시도/ })[0]);
    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: /근거 보기/ })).toBeInTheDocument();
  });

  it('미리보기 이후 일정이 바뀌어 거절되면 시각을 다시 계산하고 선택은 그대로 둔다', async () => {
    const conflict = new Error('미리보기 이후 일정이 바뀌어 겹치는 항목이 있습니다.');
    conflict.code = 'E409_016';
    planAPI.confirm.mockRejectedValueOnce(conflict);
    const user = userEvent.setup();
    render(<PlanDraftReview draft={DRAFT} todayIso="2026-09-10" />);
    await waitFor(() => expect(planAPI.draftProvenance).toHaveBeenCalled());
    const title = screen.getByRole('textbox');
    await user.clear(title);
    await user.type(title, '소켓 주간');

    await user.click(screen.getByRole('button', { name: /계획 확정/ }));

    expect(await screen.findByText(/시각을 다시 계산했으니/)).toBeInTheDocument();
    await waitFor(() => expect(schedulePreviewAPI.recompute).toHaveBeenCalledWith(77, {}));
    expect(screen.getByRole('textbox')).toHaveValue('소켓 주간');
    expect(screen.getByRole('button', { name: /계획 확정/ })).toBeEnabled();
  });
});

describe('항목별 근거 — 여러 단계 범위와 일부 재연결', () => {
  it('3단계 범위(A > B > C)에서 마지막 단계 제목이 기본 화면에 보인다', async () => {
    planAPI.draftProvenance.mockResolvedValue({
      ...PROVENANCE,
      providedSources: [
        PROVENANCE.providedSources[0],
        topicSource('s2', 101, '네트워크와 소켓 프로그래밍'),
        topicSource('s3', 102, '소켓의 개념', 101),
        topicSource('s4', 103, '소켓 함수의 동작 순서', 102),
      ],
      items: [{ ...PROVENANCE.items[0], refIds: ['s2', 's3', 's4'] }],
    });
    const user = userEvent.setup();
    await openEvidence(user);

    const body = screen.getByText('학습 범위').closest('.plan-evidence-body');
    expect(within(body).getByText('네트워크와 소켓 프로그래밍')).toBeInTheDocument();
    expect(within(body).getByText(/소켓의 개념 \(소켓 함수의 동작 순서\)/)).toBeInTheDocument();
    // 범위 묶음은 하나, 열기 액션도 하나. 내부 스크롤 없음.
    expect(body.querySelectorAll('.plan-evidence-scope > li')).toHaveLength(1);
    expect(within(body).getAllByRole('button', { name: /원본 자료 열기/ })).toHaveLength(1);
    expect(body.querySelector('.plan-evidence-detail')).toBeNull();
  });

  const RELINKED = {
    ...PDF, materialId: 900, currentFilename: '네트워크 2주차(개정).pdf', state: 'RELINKED',
    note: '생성 당시와 다른 자료가 연결돼 있어요 · 현재 파일을 열어요',
  };

  async function openWithRelink(user, order) {
    const sources = {
      s2: topicSource('s2', 101, '네트워크와 소켓 프로그래밍'),
      s3: topicSource('s3', 102, '소켓의 개념', 101, RELINKED),
    };
    planAPI.draftProvenance.mockResolvedValue({
      ...PROVENANCE,
      providedSources: [PROVENANCE.providedSources[0], ...order.map((ref) => sources[ref])],
      items: [{ ...PROVENANCE.items[0], refIds: order }],
    });
    await openEvidence(user);
    return screen.getByText('참고 자료').closest('.plan-evidence-body');
  }

  it.each([
    ['정순', ['s2', 's3']],
    ['역순', ['s3', 's2']],
  ])('일부 주제만 다른 자료로 재연결됐으면(%s) 두 행으로 나뉘고 각 행이 자기 파일을 연다', async (_label, order) => {
    const user = userEvent.setup();
    const body = await openWithRelink(user, order);

    const rows = body.querySelectorAll('.plan-evidence-material');
    expect(rows).toHaveLength(2);
    // 첫 행: 당시 파일 그대로(657), 둘째 행: 재연결된 새 파일(900). 순서는 인용 순서와 무관하다.
    expect(within(rows[0]).getByText(/해당 항목: 네트워크와 소켓 프로그래밍/)).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/다른 자료가 연결/)).not.toBeInTheDocument();
    expect(within(rows[1]).getByText(/해당 항목: 소켓의 개념/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/다른 자료가 연결돼 있어요/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/지금 파일: 네트워크 2주차\(개정\)\.pdf/)).toBeInTheDocument();
    // 당시 위치는 당시 파일 기준이라고 말한다.
    expect(within(rows[1]).getByText(/2주차 확인 \(생성 당시 파일 기준\)/)).toBeInTheDocument();

    // 실제로 여는 자료 id가 행마다 다르다.
    await user.click(within(rows[1]).getByRole('button', { name: /원본 자료 열기/ }));
    await waitFor(() => expect(materialStoreAPI.file).toHaveBeenLastCalledWith(900));
    await user.click(within(rows[0]).getByRole('button', { name: /원본 자료 열기/ }));
    await waitFor(() => expect(materialStoreAPI.file).toHaveBeenLastCalledWith(657));
  });

  it('둘 다 같은 새 파일로 재연결됐으면 한 행이고 어느 항목인지 따로 적지 않는다', async () => {
    planAPI.draftProvenance.mockResolvedValue({
      ...PROVENANCE,
      providedSources: [
        PROVENANCE.providedSources[0],
        topicSource('s2', 101, '네트워크와 소켓 프로그래밍', null, RELINKED),
        topicSource('s3', 102, '소켓의 개념', 101, RELINKED),
      ],
      items: [{ ...PROVENANCE.items[0], refIds: ['s2', 's3'] }],
    });
    const user = userEvent.setup();
    await openEvidence(user);

    const body = screen.getByText('참고 자료').closest('.plan-evidence-body');
    expect(body.querySelectorAll('.plan-evidence-material')).toHaveLength(1);
    expect(within(body).queryByText(/해당 항목:/)).not.toBeInTheDocument();
    expect(within(body).getAllByRole('button', { name: /원본 자료 열기/ })).toHaveLength(1);
  });
});

describe('적용된 항목의 근거', () => {
  it('펼칠 때만 불러오고, 같은 회차의 근거를 짧은 화면으로 보여준다', async () => {
    const user = userEvent.setup();
    render(<ExecutionItemEvidence executionItemId={501} version={1} />);

    // 목록에 수십 개가 있어도 열기 전에는 요청하지 않는다.
    expect(planAPI.itemProvenance).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /근거 보기/ }));

    await waitFor(() => expect(planAPI.itemProvenance).toHaveBeenCalledWith(501));
    expect(await screen.findByText('학습 범위')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /원본 자료 열기/ })).toBeInTheDocument();
    // 회차 전체 정보는 상세 안에 있다.
    expect(screen.queryByRole('button', { name: /생성 시 참고한 정보/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /생성 당시 정보 자세히 보기/ }));
    expect(screen.getByRole('button', { name: /생성 시 참고한 정보/ })).toBeInTheDocument();
  });

  /**
   * 옮기거나 줄이면 조각의 version이 오른다. 그때 옛 응답을 계속 보여주면 "적용 후 바뀜"
   * 표식이 뜨지 않아 사용자가 지금 배치를 AI가 낸 것으로 읽는다.
   */
  it('조각이 바뀌면(version) 옛 응답을 버리고 다시 불러와 적용 후 바뀜을 보여준다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ExecutionItemEvidence executionItemId={501} version={1} />);
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    await waitFor(() => expect(planAPI.itemProvenance).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('적용 후 바뀜')).not.toBeInTheDocument();

    planAPI.itemProvenance.mockResolvedValue(withItem({
      afterApplyChanges: ['적용한 뒤 분량을 줄였어요. 아래는 줄이기 전 제안의 근거예요.'],
    }));
    rerender(<ExecutionItemEvidence executionItemId={501} version={2} />);

    await waitFor(() => expect(planAPI.itemProvenance).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('적용 후 바뀜')).toBeInTheDocument();
    expect(screen.getByText(/적용한 뒤 분량을 줄였어요/)).toBeInTheDocument();
    // 근거 자체는 그대로 보인다.
    expect(screen.getByText('네트워크와 소켓 프로그래밍')).toBeInTheDocument();
  });

  it('같은 조각·같은 version은 다시 부르지 않고, 실패한 요청은 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    planAPI.itemProvenance.mockRejectedValueOnce(new Error('네트워크가 끊겼어요'));
    render(<ExecutionItemEvidence executionItemId={502} version={3} />);
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    expect(await screen.findByText(/네트워크가 끊겼어요/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /다시 시도/ }));
    expect(await screen.findByText('학습 범위')).toBeInTheDocument();
    expect(planAPI.itemProvenance).toHaveBeenCalledTimes(2);

    // 닫았다 열어도, 다른 화면에서 같은 조각을 열어도 다시 부르지 않는다.
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    render(<ExecutionItemEvidence executionItemId={502} version={3} />);
    expect(planAPI.itemProvenance).toHaveBeenCalledTimes(2);
  });

  it('원본 파일을 열지 못하면 캐시를 버리고 상태를 다시 읽는다', async () => {
    materialStoreAPI.file.mockRejectedValueOnce(new Error('자료를 찾을 수 없어요'));
    vi.spyOn(window, 'open').mockReturnValue({ location: null, opener: {}, close: vi.fn() });
    const user = userEvent.setup();
    render(<ExecutionItemEvidence executionItemId={503} version={1} />);
    await user.click(screen.getByRole('button', { name: /근거 보기/ }));
    await screen.findByText('학습 범위');

    planAPI.itemProvenance.mockResolvedValue(withMaterial({
      materialId: null, state: 'DELETED', openMode: 'NONE', note: '원본 자료가 지워졌어요',
    }));
    await user.click(screen.getByRole('button', { name: /원본 자료 열기/ }));

    await waitFor(() => expect(planAPI.itemProvenance).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/원본 자료가 지워졌어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /원본 자료 열기/ })).not.toBeInTheDocument();
  });
});
