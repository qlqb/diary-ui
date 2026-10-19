/**
 * 자동 분석 상태 폴링.
 *
 * 서버 작업 표가 원본이라 화면은 읽기만 한다. 진행 중(대기·분석 중)인 자료가 하나라도 있을 때만
 * 8초 간격으로 다시 읽고, 전부 끝나면 멈춘다. 화면을 떠나면 타이머를 지운다. 응답 순번을 들고
 * 늦게 도착한 옛 응답은 버린다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { materialAnalysisStatusAPI } from '../../api/api.js';
import { isAnalysisInProgress } from '../../lib/analysisLabels.js';

const POLL_MS = 8000;

export default function useAnalysisOverview({ enabled = true, refreshKey = 0 } = {}) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    try {
      const next = await materialAnalysisStatusAPI.overview();
      if (ticket.current === mine) {
        setOverview(next);
        setError(null);
      }
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '분석 상태를 불러오지 못했어요.');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    // 비동기 IIFE — 상태 갱신은 응답이 온 뒤에만 일어난다(동기 setState 없음).
    (async () => { await load(); })();
    return () => { ticket.current += 1; };
  }, [enabled, refreshKey, load]);

  const inProgress = useMemo(
    () => (overview?.materials ?? []).some((m) => isAnalysisInProgress(m.state)) && !overview?.paused
      && overview?.serviceAvailable !== false,
    [overview],
  );

  useEffect(() => {
    if (!enabled || !inProgress) return undefined;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, inProgress, load]);

  const byMaterialId = useMemo(() => {
    const map = new Map();
    (overview?.materials ?? []).forEach((m) => map.set(m.materialId, m));
    return map;
  }, [overview]);

  const pause = useCallback(async () => {
    setOverview(await materialAnalysisStatusAPI.pause());
  }, []);
  const resume = useCallback(async () => {
    setOverview(await materialAnalysisStatusAPI.resume());
  }, []);
  const retry = useCallback(async (materialId) => {
    await materialAnalysisStatusAPI.retry(materialId);
    await load();
  }, [load]);

  return { overview, byMaterialId, error, reload: load, pause, resume, retry, inProgress };
}
