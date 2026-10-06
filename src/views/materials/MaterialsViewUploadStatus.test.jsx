/**
 * 업로드 결과 요약과 분석 대기 문구.
 *
 * 고정하는 것:
 *  - 일부가 안 된 배치를 "다 올렸어요"로 끝내지 않는다. 몇 개가 올라갔고, 무엇이 왜 안 됐고,
 *    그 파일 내용이 상담·계획에 쓰이지 않는다는 것까지 말한다.
 *  - .sh는 받는다(실행하지 않는 텍스트 자료).
 *  - 오늘 한도 대기는 실패처럼 보이지 않는다 — 언제 이어지는지를 말한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaterialsView from './MaterialsView.jsx';
import { createFakeBatchApi } from '../../testing/fakeAnalysisBatch.js';
import AnalysisStatusChip from '../../components/AnalysisStatusChip.jsx';
import AnalysisOverviewBar from './AnalysisOverviewBar.jsx';
import MaterialStages from './MaterialStages.jsx';
import { dailyLimitCopy, formatResumeTime, materialStages, waitingCopy } from '../../lib/materialStages.js';
import { analysisBatchAPI, materialAnalysisStatusAPI, materialStoreAPI } from '../../api/api.js';

vi.mock('../../api/api.js', () => ({
  materialAnalysisStatusAPI: {
    overview: vi.fn(), retry: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    sections: vi.fn().mockResolvedValue([]), status: vi.fn().mockResolvedValue(null),
  },
  zipImportAPI: {
    create: vi.fn(), listRecent: vi.fn().mockResolvedValue([]), get: vi.fn(), confirm: vi.fn(),
    retryEntry: vi.fn(), cancel: vi.fn(),
  },
  analysisBatchAPI: {
    estimate: vi.fn(), create: vi.fn(), get: vi.fn(), listOpen: vi.fn(), listOpenPage: vi.fn(),
  },
  materialStoreAPI: {
    list: vi.fn(), retryExtraction: vi.fn(), get: vi.fn(), upload: vi.fn(), delete: vi.fn(), addLink: vi.fn(),
    updateLinkType: vi.fn(), removeLink: vi.fn(), proposeLinks: vi.fn(), applyLinkProposal: vi.fn(),
  },
}));

const EMPTY_OVERVIEW = { materials: [], paused: false, serviceAvailable: true, queued: 0, running: 0, done: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  /*
   * 업로드는 이제 서버 묶음을 먼저 열고 그 자리마다 올린다. 화면 테스트는 그 계약만 흉내 낸다 —
   * 진행률·예상 시간의 실제 계산은 서버 몫이고 서버 테스트가 본다.
   */
  const fakeBatch = createFakeBatchApi();
  analysisBatchAPI.estimate.mockImplementation(fakeBatch.estimate);
  analysisBatchAPI.create.mockImplementation(fakeBatch.create);
  analysisBatchAPI.get.mockImplementation(fakeBatch.get);
  analysisBatchAPI.listOpen.mockImplementation(fakeBatch.listOpen);
  analysisBatchAPI.listOpenPage.mockImplementation(fakeBatch.listOpenPage);
  materialStoreAPI.list.mockResolvedValue([]);
  materialStoreAPI.proposeLinks.mockResolvedValue({ status: 'NO_CANDIDATES', groups: [] });
  materialAnalysisStatusAPI.overview.mockResolvedValue(EMPTY_OVERVIEW);
});

async function pick(container, files) {
  const input = container.querySelector('input[type="file"]');
  await act(async () => { fireEvent.change(input, { target: { files } }); });
}

describe('업로드 결과 요약', () => {
  it('일부 실패 + 미지원이 섞인 배치: "N개 올림 · M개 실패 · K개 미지원"과 파일별 이유·영향을 보여 준다', async () => {
    const user = userEvent.setup();
    materialStoreAPI.upload.mockImplementation(async (file) => {
      if (file.name === '깨진파일.pdf') throw new Error('파일을 읽지 못했어요');
      return { materialId: file.name.length, extractionStatus: 'SUCCESS' };
    });
    const { container } = render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);

    await pick(container, [
      new File(['x'], '1주차.pdf', { type: 'application/pdf' }),
      new File(['#!/bin/sh'], 'setup.sh', { type: '' }),
      new File(['x'], '깨진파일.pdf', { type: 'application/pdf' }),
      new File(['x'], '보고서.docx', { type: '' }),
    ]);

    // .sh는 담긴다 — 올릴 대상이 셋이다.
    await user.click(screen.getByRole('button', { name: /3개 분석 시작/ }));

    const summary = await screen.findByRole('status', { name: '업로드 결과' });
    expect(within(summary).getByText('2개 올림 · 1개 실패 · 1개 미지원')).toBeInTheDocument();
    expect(within(summary).getByText(/깨진파일\.pdf — 파일을 읽지 못했어요/)).toBeInTheDocument();
    expect(within(summary).getByText(/보고서\.docx — .*만 올릴 수 있어요/)).toBeInTheDocument();
    expect(within(summary).getAllByText('이 파일 내용은 상담·계획에 쓰이지 않아요')).toHaveLength(2);
    expect(within(summary).queryByText(/setup\.sh/)).not.toBeInTheDocument();
    expect(materialStoreAPI.upload).toHaveBeenCalledTimes(3);
  });

  it('전부 올라갔으면 실패·미지원을 세지 않는다', async () => {
    const user = userEvent.setup();
    materialStoreAPI.upload.mockResolvedValue({ materialId: 1, extractionStatus: 'SUCCESS' });
    const { container } = render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);
    await pick(container, [new File(['x'], '1주차.pdf', { type: 'application/pdf' })]);
    await user.click(screen.getByRole('button', { name: /1개 분석 시작/ }));

    const summary = await screen.findByRole('status', { name: '업로드 결과' });
    expect(within(summary).getByText('1개 올림')).toBeInTheDocument();
    expect(within(summary).queryByText(/실패|미지원/)).not.toBeInTheDocument();
  });

  it('저장은 됐지만 본문을 못 읽은 파일도 상담·계획에 쓰이지 않는다고 말한다', async () => {
    const user = userEvent.setup();
    materialStoreAPI.upload.mockResolvedValue({ materialId: 1, extractionStatus: 'FAILED_NO_TEXT' });
    const { container } = render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);
    await pick(container, [new File(['x'], '스캔본.pdf', { type: 'application/pdf' })]);
    await user.click(screen.getByRole('button', { name: /1개 분석 시작/ }));

    const summary = await screen.findByRole('status', { name: '업로드 결과' });
    expect(within(summary).getByText('1개 올림 · 1개 본문 못 읽음')).toBeInTheDocument();
    expect(within(summary).getByText('이 파일 내용은 상담·계획에 쓰이지 않아요')).toBeInTheDocument();
  });

  it('셸 스크립트는 실행하지 않는다고 안내한다', async () => {
    render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);
    expect(await screen.findByText('셸 스크립트(.sh)는 실행하지 않고 텍스트 자료로만 읽어요')).toBeInTheDocument();
  });
});

describe('분석 대기 문구', () => {
  const NOW = new Date(2026, 8, 19, 15, 0, 0);

  it('한도 대기 문구는 언제 이어지는지를 말하고, 시각이 없으면 지어내지 않는다', () => {
    expect(dailyLimitCopy('2026-09-20T00:00:00', NOW))
      .toBe('오늘 분석 한도에 닿아 대기 중이에요 · 내일 00:00부터 이어서 처리해요');
    expect(formatResumeTime('2026-09-19T18:30:00', NOW)).toBe('오늘 18:30');
    expect(formatResumeTime('2026-09-25T09:00:00', NOW)).toBe('9월 25일 09:00');
    expect(dailyLimitCopy(null, NOW)).toBe('오늘 분석 한도에 닿아 대기 중이에요 · 한도가 풀리면 이어서 처리해요');
  });

  it('차례·일시중지·서비스 연결은 각자 다른 말을 하고, 어느 것도 실패·중단이라고 하지 않는다', () => {
    const copies = ['DAILY_LIMIT', 'QUEUED', 'PAUSED', 'SERVICE_UNAVAILABLE'].map((r) => waitingCopy(r, null, NOW));
    expect(new Set(copies.map((c) => c.detail)).size).toBe(4);
    expect(new Set(copies.map((c) => c.short)).size).toBe(4);
    copies.forEach((c) => expect(`${c.short} ${c.detail}`).not.toMatch(/실패|중단|오류/));
    expect(waitingCopy(null)).toBeNull();
    expect(waitingCopy('SOMETHING_NEW')).toBeNull();
  });

  it('칩: 한도 대기는 경고 톤이 아니고 다시 시도 버튼도 없다', () => {
    render(<AnalysisStatusChip status={{ state: 'QUEUED', waitingReason: 'DAILY_LIMIT' }}
      limit={{ reached: true, resumesAt: '2030-01-01T00:00:00' }} onRetry={vi.fn()} showWaitingDetail />);
    const chip = screen.getByLabelText('분석 상태: 한도 대기');
    expect(chip.className).toContain('chip-status');
    expect(chip.className).not.toContain('chip-warn');
    expect(screen.getByText(/오늘 분석 한도에 닿아 대기 중이에요 · 1월 1일 00:00부터 이어서 처리해요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '분석 다시 시도' })).not.toBeInTheDocument();
  });

  it('상단 줄: 한도에 닿았으면 그 사실과, 승인 전에도 상담·계획이 된다는 것을 말한다', () => {
    render(<AnalysisOverviewBar onPause={vi.fn()} onResume={vi.fn()} overview={{
      ...EMPTY_OVERVIEW, queued: 3,
      limit: { contentUsed: 20, contentLimit: 20, linkUsed: 0, linkLimit: 30, reached: true, resumesAt: '2030-01-01T00:00:00' },
    }} />);
    expect(screen.getByText(/오늘 분석 한도에 닿아 대기 중이에요 · 1월 1일 00:00부터 이어서 처리해요/)).toBeInTheDocument();
    expect(screen.getByText(/오늘 20\/20개 분석/)).toBeInTheDocument();
    expect(screen.getByText('학습 구조를 정리하기 전에도 상담과 계획은 할 수 있어요')).toBeInTheDocument();
  });

  it('limit 필드가 없는 예전 서버 응답에서는 한도 문구를 그리지 않는다', () => {
    render(<AnalysisOverviewBar onPause={vi.fn()} onResume={vi.fn()} overview={{ ...EMPTY_OVERVIEW, done: 4 }} />);
    expect(screen.queryByText(/한도/)).not.toBeInTheDocument();
  });
});

/*
 * (2026-09-21) 단계가 셋으로 줄었다. 네 번째였던 "구조 제안(연결)"은 자료마다 자동으로 돌던 일인데,
 * 이제 학습 구조 정리는 프로젝트 화면에서 사용자가 누를 때 한 번에 한다 — 자료 줄에 계속 띄우면
 * 누르지도 않은 일이 밀린 것처럼 보인다.
 */
describe('자료별 세 단계', () => {
  it('등록 / 텍스트 추출 / 내용 분석을 각각 글자 상태로 보여 준다', () => {
    render(<MaterialStages material={{ originalFilename: 'a.pdf', extractionStatus: 'SUCCESS' }}
      status={{ state: 'QUEUED', waitingReason: 'DAILY_LIMIT' }}
      limit={{ reached: true, resumesAt: null }} />);
    const list = screen.getByRole('list', { name: 'a.pdf 처리 단계' });
    const items = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['등록완료', '텍스트 추출완료', '내용 분석대기']);
    expect(screen.getByText(/한도가 풀리면 이어서 처리해요/)).toBeInTheDocument();
  });

  it('구조 제안 단계는 더 이상 자료 줄에 없다 — 정리는 프로젝트에서 누를 때 한다', () => {
    render(<MaterialStages material={{ originalFilename: 'a.pdf', extractionStatus: 'SUCCESS' }}
      status={{ state: 'DONE' }} limit={null} />);
    expect(screen.queryByText(/구조 제안/)).not.toBeInTheDocument();
  });

  it('본문을 못 읽었으면 뒤 단계는 "해당 없음"이다', () => {
    const stages = materialStages({ extractionStatus: 'FAILED_NO_TEXT' }, null);
    expect(stages.map((s) => s.state)).toEqual(['done', 'problem', 'skipped']);
  });

  it('상태를 아직 못 읽었으면 단정하지 않고 "확인 중"이다', () => {
    const stages = materialStages({ extractionStatus: 'SUCCESS' }, null);
    expect(stages.map((s) => s.state)).toEqual(['done', 'done', 'unknown']);
  });
});
