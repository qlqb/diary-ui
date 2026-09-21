/**
 * 분석 중 추가 업로드와 화면 복원.
 *
 * 고정하는 것:
 *  - 분석 중에 파일을 더 올리면 <새 묶음>이 생긴다. 기존 묶음의 분모가 늘어나 진행률이 뒤로
 *    가지 않는다 — 80%가 30%로 떨어지던 것이 이 기능의 원래 문제였다.
 *  - 화면에 다시 들어오면 서버가 들고 있던 진행 상태가 복원된다. 브라우저 상태가 원본이 아니다.
 *  - 업로드는 묶음 자리 번호를 실어 보낸다 — 그래야 서버가 진행을 자리에 적는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/api.js', () => ({
  materialAnalysisStatusAPI: {
    overview: vi.fn(), retry: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    sections: vi.fn().mockResolvedValue([]), status: vi.fn().mockResolvedValue(null),
  },
  zipImportAPI: {
    create: vi.fn(), listRecent: vi.fn().mockResolvedValue([]), get: vi.fn(), confirm: vi.fn(),
    retryEntry: vi.fn(), cancel: vi.fn(),
  },
  analysisBatchAPI: { estimate: vi.fn(), create: vi.fn(), get: vi.fn(), listOpen: vi.fn(), listOpenPage: vi.fn() },
  materialStoreAPI: {
    list: vi.fn(), retryExtraction: vi.fn(), get: vi.fn(), upload: vi.fn(), delete: vi.fn(),
    addLink: vi.fn(), updateLinkType: vi.fn(), removeLink: vi.fn(), proposeLinks: vi.fn(),
    applyLinkProposal: vi.fn(),
  },
}));

import MaterialsView from './MaterialsView.jsx';
import { analysisBatchAPI, materialAnalysisStatusAPI, materialStoreAPI } from '../../api/api.js';
import { createFakeBatchApi } from '../../testing/fakeAnalysisBatch.js';

const EMPTY_OVERVIEW = { materials: [], paused: false, serviceAvailable: true, queued: 0, running: 0, done: 0 };
const pdf = (name) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

let fake;

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeBatchApi();
  analysisBatchAPI.estimate.mockImplementation(fake.estimate);
  analysisBatchAPI.create.mockImplementation(fake.create);
  analysisBatchAPI.get.mockImplementation(fake.get);
  analysisBatchAPI.listOpen.mockImplementation(fake.listOpen);
  analysisBatchAPI.listOpenPage.mockImplementation(fake.listOpenPage);
  materialStoreAPI.list.mockResolvedValue([]);
  materialStoreAPI.proposeLinks.mockResolvedValue({ status: 'NO_CANDIDATES', groups: [] });
  materialStoreAPI.upload.mockImplementation(async (file) => ({
    materialId: file.name.length, extractionStatus: 'SUCCESS',
  }));
  materialAnalysisStatusAPI.overview.mockResolvedValue(EMPTY_OVERVIEW);
});

async function pickAndStart(container, files) {
  const user = userEvent.setup();
  const input = container.querySelector('input[type="file"]');
  await act(async () => { fireEvent.change(input, { target: { files } }); });
  await user.click(await screen.findByRole('button', { name: new RegExp(`${files.length}개 분석 시작`) }));
  return user;
}

describe('분석 중 추가 업로드', () => {
  it('새 묶음이 따로 생기고 기존 묶음의 분모는 그대로다', async () => {
    const { container } = render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);

    await pickAndStart(container, [pdf('가.pdf'), pdf('나.pdf'), pdf('다.pdf')]);
    const first = await screen.findByRole('region', { name: /자료 분석/ });
    expect(within(first).getByText(/3개 중/)).toBeInTheDocument();

    // 분석이 도는 동안 두 개를 더 올린다.
    await pickAndStart(container, [pdf('라.pdf'), pdf('마.pdf')]);

    await waitFor(() => expect(screen.getAllByRole('region', { name: /자료 분석/ })).toHaveLength(2));
    const cards = screen.getAllByRole('region', { name: /자료 분석/ });
    // 묶음은 최신이 위다. 먼저 만든 묶음은 여전히 3개짜리다.
    expect(within(cards[0]).getByText(/2개 중/)).toBeInTheDocument();
    expect(within(cards[1]).getByText(/3개 중/)).toBeInTheDocument();
    expect(analysisBatchAPI.create).toHaveBeenCalledTimes(2);
  });

  it('업로드는 묶음 자리 번호를 실어 보낸다', async () => {
    const { container } = render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);

    await pickAndStart(container, [pdf('가.pdf')]);

    await waitFor(() => expect(materialStoreAPI.upload).toHaveBeenCalled());
    expect(materialStoreAPI.upload).toHaveBeenCalledWith(expect.any(File), expect.any(Number));
  });
});

describe('화면 복원', () => {
  it('다시 들어오면 서버가 들고 있던 진행 상태가 그대로 보인다', async () => {
    // 이전 방문에서 시작해 아직 도는 묶음.
    await fake.create({ courseId: null, files: [{ filename: '지난번.pdf', sizeBytes: 1 }] });
    fake.__advance('지난번.pdf', { uploadState: 'UPLOADED', stage: 'ANALYZING', stageLabel: '내용 분석' });

    render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);

    const card = await screen.findByRole('region', { name: /자료 분석/ });
    expect(within(card).getByText('지난번.pdf')).toBeInTheDocument();
    expect(within(card).getByText('내용 분석')).toBeInTheDocument();
  });

  it('끝난 묶음은 복원하지 않는다 — 할 일이 없는 카드를 계속 띄우지 않는다', async () => {
    await fake.create({ courseId: null, files: [{ filename: '끝난것.pdf', sizeBytes: 1 }] });
    fake.__finishAll();

    render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);

    await waitFor(() => expect(analysisBatchAPI.listOpenPage).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: /자료 분석/ })).not.toBeInTheDocument();
  });
});

describe('시작 전 예상 시간', () => {
  it('고르면 예상 범위와 근거를 말하고, 전송 시간은 따로라고 알린다', async () => {
    const { container } = render(<MaterialsView projects={[]} onProjectsChanged={vi.fn()} />);
    const input = container.querySelector('input[type="file"]');
    await act(async () => { fireEvent.change(input, { target: { files: [pdf('가.pdf'), pdf('나.pdf')] } }); });

    expect(await screen.findByText(/자료 2개 · 예상 분석/)).toBeInTheDocument();
    expect(screen.getByText(/아직 초기 추정이에요/)).toBeInTheDocument();
    expect(screen.getByText(/올리는 데 걸리는 시간은 따로예요/)).toBeInTheDocument();
  });
});
