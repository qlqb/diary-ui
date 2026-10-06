/**
 * 업로드·분석 묶음을 다루는 훅.
 *
 * 왜 서버에 묶음을 두고 여기서는 읽기만 하는가:
 *  - 탭을 옮기거나 새로고침해도 "무엇이 도는 중인지"가 남아야 한다. 브라우저 상태로는 안 된다.
 *  - 분석 중에 파일을 더 올리면 <새 묶음>이 생긴다. 기존 묶음의 분모를 늘리면 80%가 30%로
 *    떨어진다.
 *  - 진행률·남은 시간은 서버가 작업 표에서 센 값이다. 여기서 타이머로 만들지 않는다.
 *
 * 폴링은 도는 묶음이 있을 때만 하고, 화면을 떠나면 멈춘다. 늦게 도착한 응답은 세대 값으로 버린다.
 *
 * <목록에 없다는 것은 끝났다는 증거가 아니다.> 2026-09-21 판은 열린 목록(최대 5개)에서 빠진
 * 묶음을 곧바로 FINISHED로 바꾸고 이전 진행률을 그대로 붙였다. 여섯 번째 묶음을 만드는 순간
 * 40% 분석 중이던 묶음이 "처리 종료 · 40%"가 됐다. 이제는
 *   - 열린 목록을 끝까지 넘겨 읽고(쪽 나눔),
 *   - 그래도 보이지 않는 묶음은 하나씩 서버에 물어 그 답을 그대로 쓰며,
 *   - 물어도 답을 못 받으면 <모른다>로 둔다. 끝났다고 추측하지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { analysisBatchAPI, materialStoreAPI, materialAPI } from '../../api/api.js';
import { isBatchOpen } from '../../lib/analysisBatch.js';

/** 도는 묶음이 있을 때의 폴링 간격. 자료함 상태 폴링(8초)보다 짧다 — 사용자가 보고 있다. */
const POLL_MS = 4000;

/** 열린 목록 한 쪽의 크기. 서버 상한(50)보다 작게 두고 끝까지 넘긴다. */
const PAGE_SIZE = 20;

/** 쪽을 넘기는 최대 횟수. 서버가 이상한 커서를 줘도 무한히 돌지 않게 한다. */
const MAX_PAGES = 20;

/** 열린 묶음을 전부 읽는다. 한 쪽이라도 실패하면 전체를 실패로 본다 — 반쪽 목록으로 추측하지 않는다. */
async function listAllOpen(courseId) {
  const all = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await analysisBatchAPI.listOpenPage({ courseId, cursor, limit: PAGE_SIZE });
    (res?.batches ?? []).forEach((b) => all.push(b));
    cursor = res?.nextCursor ?? null;
    if (cursor == null) return all;
  }
  throw new Error('열린 묶음을 끝까지 읽지 못했어요');
}

/** 이 묶음의 "끝남"을 식별하는 값. 다시 시도해 다시 끝나면 새 알림이 나가야 한다. */
const finishKey = (batch) => `${batch.batchId}:${batch.finishedAt ?? ''}`;

/**
 * @param courseId        프로젝트 화면이면 그 프로젝트. 자료함이면 null
 * @param materialType    프로젝트 화면에서 올릴 때의 역할. null이면 전역 자료함 업로드
 * @param onUploaded      자료가 하나라도 올라간 뒤(목록을 다시 읽게 한다)
 * @param onBatchFinished 묶음 하나가 끝났을 때
 */
export function useAnalysisBatches({
  courseId = null, materialType = null, onUploaded = null, onBatchFinished = null,
} = {}) {
  const [batches, setBatches] = useState([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const ticketRef = useRef(0);
  const finishedRef = useRef(new Set());
  const callbacksRef = useRef({ onUploaded, onBatchFinished });
  callbacksRef.current = { onUploaded, onBatchFinished };

  /** 지금 화면이 들고 있는 묶음. 비동기 흐름 안에서 최신 값을 읽으려고 둔다. */
  const batchesRef = useRef(batches);
  batchesRef.current = batches;

  /*
    세대. 프로젝트가 바뀌거나 화면을 떠나면 올린다. 그 전에 떠난 요청의 응답은 도착해도
    아무것도 바꾸지 못한다 — 앞 프로젝트의 묶음이 새 프로젝트 화면에 섞이지 않게.
  */
  const epochRef = useRef(0);
  /** 묶음마다 마지막으로 반영한 응답의 순번. 늦게 온 옛 응답이 새 응답을 덮지 않게 한다. */
  const seqRef = useRef(new Map());
  const nextSeqRef = useRef(0);

  /** 묶음 하나의 응답을 반영한다. 더 새 응답이 이미 들어왔으면 버린다. */
  const acceptOne = useCallback((epoch, seq, batch) => {
    if (epochRef.current !== epoch || !batch) return false;
    const last = seqRef.current.get(batch.batchId) ?? -1;
    if (seq < last) return false;
    seqRef.current.set(batch.batchId, seq);
    setBatches((prev) => {
      const found = prev.some((b) => b.batchId === batch.batchId);
      return found ? prev.map((b) => (b.batchId === batch.batchId ? batch : b))
        : [batch, ...prev].sort((a, b) => b.batchId - a.batchId);
    });
    return true;
  }, []);

  /** 서버의 열린 묶음으로 화면을 맞춘다. 진입·복원·폴링이 모두 이 함수를 지난다. */
  const refresh = useCallback(async () => {
    const mine = ticketRef.current + 1;
    ticketRef.current = mine;
    const epoch = epochRef.current;
    const seq = (nextSeqRef.current += 1);
    let open;
    try {
      open = await listAllOpen(courseId);
    } catch {
      // 목록을 못 읽었다. 화면은 그대로 둔다 — 여기서 무엇을 끝났다고 판단할 근거가 없다.
      return;
    }
    if (ticketRef.current !== mine || epochRef.current !== epoch) return;

    const openIds = new Set(open.map((b) => b.batchId));
    open.forEach((b) => seqRef.current.set(b.batchId, Math.max(seq, seqRef.current.get(b.batchId) ?? -1)));
    // 빠진 것은 지금 화면이 들고 있는 값에서 고른다. setState 갱신 함수 안에서 고르면 React가
    // 그 함수를 나중에 부를 수 있어, 아래에서 쓸 때 아직 비어 있을 수 있다.
    const missing = batchesRef.current
      .filter((b) => !openIds.has(b.batchId) && isBatchOpen(b))
      .map((b) => b.batchId);
    setBatches((prev) => {
      const kept = prev.filter((b) => !openIds.has(b.batchId));
      return [...open, ...kept].sort((a, b) => b.batchId - a.batchId);
    });

    /*
      목록에서 빠졌는데 화면은 아직 도는 중으로 알던 묶음. 끝났을 수도, 아닐 수도 있다.
      하나씩 서버에 묻고 그 답(최종 성공·실패·제외 수와 실제 진행률)을 그대로 쓴다.
      물어도 답이 없으면 <모름>으로 표시만 하고 이전 값을 그대로 둔다.
    */
    await Promise.all(missing.map(async (batchId) => {
      const oneSeq = (nextSeqRef.current += 1);
      try {
        const fresh = await analysisBatchAPI.get(batchId);
        acceptOne(epoch, oneSeq, fresh);
      } catch {
        if (epochRef.current !== epoch) return;
        setBatches((prev) => prev.map((b) => (b.batchId === batchId ? { ...b, unknown: true } : b)));
      }
    }));
  }, [courseId, acceptOne]);

  /**
   * 묶음 하나만 다시 읽는다. 업로드 직후·재시도 직후처럼 특정 묶음이 막 바뀐 경우.
   *
   * 세대와 순번을 확인한다. 프로젝트를 옮긴 뒤 도착한 응답이나, 더 새 응답보다 늦게 온 옛
   * 응답은 버린다.
   */
  const refreshOne = useCallback(async (batchId) => {
    const epoch = epochRef.current;
    const seq = (nextSeqRef.current += 1);
    try {
      const next = await analysisBatchAPI.get(batchId);
      return acceptOne(epoch, seq, next) ? next : null;
    } catch {
      return null;
    }
  }, [acceptOne]);

  // 프로젝트가 바뀌면 앞 프로젝트의 묶음을 비우고 세대를 올린다.
  useEffect(() => {
    epochRef.current += 1;
    seqRef.current = new Map();
    setBatches([]);
  }, [courseId]);

  // 진입할 때 한 번 읽어 도는 묶음을 복원한다. 화면을 떠나면 늦게 온 응답을 버린다.
  useEffect(() => {
    refresh();
    return () => {
      ticketRef.current += 1;
      epochRef.current += 1;
    };
  }, [refresh]);

  /*
   * 폴링은 <도는 묶음이 있을 때만> 한다. 조용한 화면에서 4초마다 묻는 것은 그냥 낭비다.
   * 마지막 묶음이 끝나면 이 효과가 정리되며 멈추고, 새 묶음이 생기면 다시 걸린다.
   */
  const anyOpen = batches.some(isBatchOpen);
  useEffect(() => {
    if (!anyOpen) return undefined;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [anyOpen, refresh]);

  /*
    끝난 묶음을 <끝날 때마다> 한 번씩 알린다. 키에 종료 시각을 넣는 이유: 실패 항목을 다시
    돌려 묶음이 다시 열렸다가 다시 끝나면, 그것은 새 사건이다. batchId만으로 기억하면 두 번째
    종료를 알리지 못한다. 서버가 확인한 종료(finishedAt이 있는 FINISHED)만 센다.
  */
  useEffect(() => {
    batches.forEach((batch) => {
      if (batch.status !== 'FINISHED' || !batch.finishedAt) return;
      const key = finishKey(batch);
      if (finishedRef.current.has(key)) return;
      finishedRef.current.add(key);
      callbacksRef.current.onBatchFinished?.(batch);
    });
  }, [batches]);

  /**
   * 고른 파일로 묶음을 열고 차례대로 올린다.
   *
   * 순차로 보내는 이유는 기존 업로드와 같다 — 텍스트 추출이 동기라 한꺼번에 던지면 서버
   * 스레드가 전부 추출에 물린다. 하나가 실패해도 멈추지 않는다(각 파일은 독립된 자료다).
   *
   * @param files File 목록
   * @param onItemState (file, state) — 화면의 대기열 표시를 갱신하는 콜백
   * @param options.materialType 프로젝트 화면에서 올릴 때 이 프로젝트에서 맡는 역할.
   *        주면 업로드와 동시에 연결까지 된다. 없으면 전역 자료함 업로드다
   * @returns 올라간 자료 정보 배열
   */
  const startBatch = useCallback(async (files, onItemState = null, options = {}) => {
    if (!files || files.length === 0) return [];
    setStarting(true);
    setError(null);
    const uploaded = [];
    try {
      const batch = await analysisBatchAPI.create({
        courseId,
        files: files.map((file) => ({ filename: file.name, sizeBytes: file.size })),
      });
      setBatches((prev) => [batch, ...prev.filter((b) => b.batchId !== batch.batchId)]);

      // 서버가 준 자리는 보낸 순서 그대로다. 자리마다 하나씩 올린다.
      for (let i = 0; i < batch.items.length; i += 1) {
        const item = batch.items[i];
        const file = files[i];
        if (!file || item.uploadState !== 'STAGED') {
          onItemState?.(file, { state: 'rejected', error: item.message ?? '올릴 수 없는 파일이에요' });
          continue;
        }
        onItemState?.(file, { state: 'uploading', error: null });
        try {
          const role = options.materialType ?? materialType;
          const res = role
            ? await materialAPI.upload(courseId, role, file, item.itemId)
            : await materialStoreAPI.upload(file, item.itemId);
          uploaded.push({
            materialId: res?.materialId ?? null,
            extractionStatus: res?.extractionStatus ?? null,
          });
          onItemState?.(file, {
            state: 'done', error: null, extractionStatus: res?.extractionStatus ?? null,
          });
        } catch (err) {
          onItemState?.(file, { state: 'failed', error: err.message || '올리지 못했어요' });
        }
      }
      await refreshOne(batch.batchId);
      if (uploaded.length > 0) await callbacksRef.current.onUploaded?.(uploaded);
      return uploaded;
    } catch (err) {
      setError(err.message || '분석을 시작하지 못했어요.');
      return uploaded;
    } finally {
      setStarting(false);
    }
  }, [courseId, materialType, refreshOne]);

  /** 끝난 묶음 카드를 화면에서 치운다. 서버 상태는 그대로다. */
  const dismissBatch = useCallback((batchId) => {
    setBatches((prev) => prev.filter((b) => b.batchId !== batchId));
  }, []);

  return { batches, starting, error, startBatch, refresh, refreshOne, dismissBatch };
}
