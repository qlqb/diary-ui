/**
 * 고른 파일의 예상 분석 시간. [분석 시작]을 누르기 전에 보여준다.
 *
 * 서버에 묻는 이유: 지난 실행이 실제로 얼마나 걸렸는지는 서버만 안다. 화면에서 "파일당 30초"
 * 같은 상수를 곱하면 그 숫자는 근거가 없고, 모델이 바뀌어도 그대로 남는다.
 *
 * 고르는 동안 목록이 계속 바뀌므로 잠깐 묶어서(디바운스) 한 번만 묻고, 늦게 온 응답은 버린다.
 */

import { useEffect, useRef, useState } from 'react';
import { analysisBatchAPI } from '../../api/api.js';

const DEBOUNCE_MS = 250;

/**
 * @param files [{ name, size }] — 지금 대기열에 올릴 예정인 파일들
 * @returns { estimate, loading } estimate는 서버 응답 그대로. 못 물어봤으면 null
 */
export function useUploadEstimate(files) {
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const ticketRef = useRef(0);
  // 파일 목록의 정체성. 객체 참조가 아니라 내용으로 비교해야 매 렌더마다 다시 묻지 않는다.
  const key = (files ?? []).map((f) => `${f.name}:${f.size}`).join('|');

  useEffect(() => {
    if (!files || files.length === 0) {
      setEstimate(null);
      return undefined;
    }
    const mine = ticketRef.current + 1;
    ticketRef.current = mine;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const next = await analysisBatchAPI.estimate(
          files.map((f) => ({ filename: f.name, sizeBytes: f.size })),
        );
        if (ticketRef.current === mine) setEstimate(next);
      } catch {
        // 예상 시간을 못 받아도 업로드는 할 수 있다. 숫자를 지어내지 않고 비워 둔다.
        if (ticketRef.current === mine) setEstimate(null);
      } finally {
        if (ticketRef.current === mine) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { estimate, loading };
}
