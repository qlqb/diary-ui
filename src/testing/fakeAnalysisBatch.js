/**
 * 테스트용 가짜 분석 묶음 API.
 *
 * 서버가 하는 일 중 화면이 의존하는 것만 흉내 낸다:
 *  - create는 보낸 순서 그대로 자리를 돌려주고, 올릴 수 없는 형식은 UNSUPPORTED로 표시한다.
 *  - 자리에 업로드가 들어오면 그 자리의 단계가 바뀐다(여기서는 화면이 밀어 넣는 대로 둔다).
 *  - get은 지금 자리 상태로 진행률을 센다 — <자리 수가 분모>라는 규칙이 화면 테스트의 핵심이다.
 *
 * 실제 진행률·예상 시간 계산은 서버 몫이고 서버 테스트가 본다. 여기서는 화면이 서버가 준
 * 값을 그대로 읽는지만 본다.
 */

import { vi } from 'vitest';

const SUPPORTED = ['pdf', 'pptx', 'hwp', 'hwpx', 'ipynb', 'sh'];

function extensionOf(name) {
  const dot = String(name ?? '').lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * @param options.unsupported 이 이름들은 UNSUPPORTED 자리로 만든다(서버가 거른 것처럼)
 * @param options.estimate    estimate 호출이 돌려줄 값. 없으면 기본 범위
 */
export function createFakeBatchApi(options = {}) {
  const batches = new Map();
  let nextBatchId = 1;
  let nextItemId = 100;

  const itemOf = (batchId, filename, sizeBytes, position) => {
    const ext = extensionOf(filename);
    const unsupported = (options.unsupported ?? []).includes(filename) || !SUPPORTED.includes(ext);
    return {
      itemId: nextItemId++,
      batchId,
      filename,
      sizeBytes,
      extension: ext,
      materialId: null,
      position,
      uploadState: unsupported ? 'UNSUPPORTED' : 'STAGED',
      stage: unsupported ? 'UNSUPPORTED' : 'STAGED',
      stageLabel: unsupported ? '분석할 수 없는 형식' : '대기',
      totalChunks: null,
      completedChunks: null,
      estMinSeconds: unsupported ? null : 40,
      estMaxSeconds: unsupported ? null : 90,
      message: unsupported ? '분석할 수 없는 형식이에요' : null,
      settled: unsupported,
      retryable: false,
    };
  };

  const snapshot = (batch) => {
    const items = batch.items;
    const settled = items.filter((i) => i.settled).length;
    const done = items.filter((i) => i.stage === 'DONE').length;
    const percent = items.length === 0 ? 0 : Math.round((settled / items.length) * 100);
    const finished = settled === items.length && items.length > 0;
    return {
      ...batch,
      status: finished ? 'FINISHED' : batch.status,
      // 서버처럼 끝난 묶음에는 종료 시각이 있다. 다시 열리면 비고, 다시 끝나면 새로 찍힌다.
      finishedAt: finished ? (batch.finishedAt ?? (batch.finishedAt = `t${(batch.finishCount = (batch.finishCount ?? 0) + 1)}`))
        : (batch.finishedAt = null),
      processedPercent: percent,
      doneCount: done,
      runningCount: items.filter((i) => i.stage === 'ANALYZING').length,
      waitingCount: items.filter((i) => i.stage === 'QUEUED' || i.stage === 'STAGED').length,
      failedCount: items.filter((i) => ['FAILED', 'UPLOAD_FAILED'].includes(i.stage)).length,
      skippedCount: items.filter((i) => ['UNSUPPORTED', 'NO_TEXT', 'CANCELLED'].includes(i.stage)).length,
      currentStage: finished ? null : '내용 분석',
      remainingMinSeconds: finished ? null : 60,
      remainingMaxSeconds: finished ? null : 120,
      estimateBasis: 'DEFAULT',
      uploadTimeExcluded: true,
      waitingReason: null,
      items: items.map((i) => ({ ...i })),
    };
  };

  const api = {
    estimate: vi.fn(async (files) => options.estimate ?? {
      minSeconds: 60 * files.length,
      maxSeconds: 120 * files.length,
      basis: 'DEFAULT',
      estimableCount: files.length,
      unestimableCount: 0,
      unsupportedCount: 0,
      queueAheadSeconds: 0,
      uploadTimeExcluded: true,
      files: files.map((f) => ({
        filename: f.filename, extension: extensionOf(f.filename), sizeBytes: f.sizeBytes,
        supported: true, estimable: true, minSeconds: 60, maxSeconds: 120, reason: null,
      })),
    }),

    create: vi.fn(async ({ courseId = null, files }) => {
      const batchId = nextBatchId++;
      const batch = {
        batchId,
        courseId,
        status: 'STAGED',
        itemCount: files.length,
        items: files.map((f, i) => itemOf(batchId, f.filename, f.sizeBytes, i)),
        createdAt: new Date().toISOString(),
      };
      batches.set(batchId, batch);
      return snapshot(batch);
    }),

    get: vi.fn(async (batchId) => {
      const batch = batches.get(batchId);
      if (!batch) throw new Error('없는 묶음이에요');
      return snapshot(batch);
    }),

    /** 옛 목록 경로. 서버처럼 최대 5개에서 자른다 — 그 잘림이 2026-09-21 결함의 출발점이다. */
    listOpen: vi.fn(async () => [...batches.values()]
      .map(snapshot).filter((b) => b.status !== 'FINISHED')
      .sort((a, b) => b.batchId - a.batchId).slice(0, 5)),

    /**
     * 쪽 나눈 열린 목록. 서버와 같은 규칙: batchId 내림차순, cursor보다 작은 것, 전체 수 함께.
     * options.pageSize로 쪽 크기를 줄여 여러 쪽을 넘기는 경로를 테스트할 수 있다.
     */
    listOpenPage: vi.fn(async ({ cursor = null, limit = 20 } = {}) => {
      const open = [...batches.values()].map(snapshot).filter((b) => b.status !== 'FINISHED')
        .sort((a, b) => b.batchId - a.batchId);
      const size = Math.min(limit, options.pageSize ?? limit);
      const after = cursor == null ? open : open.filter((b) => b.batchId < cursor);
      const page = after.slice(0, size);
      const more = after.length > size;
      return {
        batches: page,
        nextCursor: more ? page[page.length - 1].batchId : null,
        totalOpen: open.length,
      };
    }),
  };

  /** 테스트가 자리의 단계를 직접 옮긴다. 업로드 결과·분석 완료를 흉내 낼 때. */
  api.__advance = (filename, patch) => {
    batches.forEach((batch) => {
      batch.items.forEach((item, i) => {
        if (item.filename === filename) batch.items[i] = { ...item, ...patch };
      });
    });
  };

  /** 자리 하나를 id로 고친다. 이름이 같은 자리가 있을 때(압축 안 run.sh 둘) 쓴다. */
  api.__advanceItem = (itemId, patch) => {
    batches.forEach((batch) => {
      batch.items = batch.items.map((i) => (i.itemId === itemId ? { ...i, ...patch } : i));
    });
  };

  /** 묶음 자체의 값을 고친다(압축에서 온 묶음 표시 등). */
  api.__patchBatch = (batchId, patch) => {
    const batch = batches.get(batchId);
    if (batch) Object.assign(batch, patch);
  };

  /** 모든 자리를 완료로. "묶음이 끝났다"를 만들 때. */
  api.__finishAll = () => {
    batches.forEach((batch) => {
      batch.items = batch.items.map((i) => (
        i.uploadState === 'UNSUPPORTED' ? i
          : { ...i, stage: 'DONE', stageLabel: '완료', settled: true, uploadState: 'UPLOADED' }));
    });
  };

  return api;
}
