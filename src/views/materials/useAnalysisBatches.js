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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { analysisBatchAPI, materialStoreAPI, materialAPI } from '../../api/api.js';
import { isBatchOpen } from '../../lib/analysisBatch.js';

/** 도는 묶음이 있을 때의 폴링 간격. 자료함 상태 폴링(8초)보다 짧다 — 사용자가 보고 있다. */
const POLL_MS = 4000;

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

  /** 서버의 열린 묶음으로 화면을 맞춘다. 진입·복원·폴링이 모두 이 함수를 지난다. */
  const refresh = useCallback(async () => {
    const mine = ticketRef.current + 1;
    ticketRef.current = mine;
    try {
      const open = await analysisBatchAPI.listOpen(courseId);
      if (ticketRef.current !== mine) return;
      setBatches((prev) => {
        // 방금 끝난 묶음은 목록에서 빠지므로, 결과를 한 번은 보여주려고 들고 있는다.
        const openIds = new Set((open ?? []).map((b) => b.batchId));
        const justFinished = prev.filter((b) => !openIds.has(b.batchId) && b.status !== 'ABANDONED');
        return [...(open ?? []), ...justFinished.map((b) => ({ ...b, status: 'FINISHED' }))]
          .sort((a, b) => b.batchId - a.batchId);
      });
    } catch {
      // 상태를 못 읽어도 화면은 그대로 둔다. 다음 틱에서 다시 읽는다.
    }
  }, [courseId]);

  /** 묶음 하나만 다시 읽는다. 업로드 직후처럼 특정 묶음이 막 바뀐 경우. */
  const refreshOne = useCallback(async (batchId) => {
    try {
      const next = await analysisBatchAPI.get(batchId);
      setBatches((prev) => {
        const found = prev.some((b) => b.batchId === batchId);
        return found ? prev.map((b) => (b.batchId === batchId ? next : b))
          : [next, ...prev].sort((a, b) => b.batchId - a.batchId);
      });
      return next;
    } catch {
      return null;
    }
  }, []);

  // 진입할 때 한 번 읽어 도는 묶음을 복원한다. 화면을 떠나면 늦게 온 응답을 버린다.
  useEffect(() => {
    refresh();
    return () => { ticketRef.current += 1; };
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

  // 끝난 묶음을 한 번만 알린다.
  useEffect(() => {
    batches.forEach((batch) => {
      if (batch.status === 'FINISHED' && !finishedRef.current.has(batch.batchId)) {
        finishedRef.current.add(batch.batchId);
        callbacksRef.current.onBatchFinished?.(batch);
      }
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
