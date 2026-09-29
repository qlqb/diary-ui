/**
 * 프로젝트 교재 — 어느 책인가(서지)와 그 책이 다루는 범위(목차).
 *
 * 예전에는 자료마다 [구조 분석]을 눌러야 교재 정보가 저장됐고, 자동 분석이 켜진 뒤로는 그 버튼이 거의 보이지 않았다.
 * 이제는 이 프로젝트를 열면 연결된 자료의 원문에서 서버가 규칙으로 읽은 후보가 여기 뜬다(모델 호출 없음).
 *
 * 화면이 지키는 것:
 *  - 후보는 후보다. 고른 칸만 적용되고, 지금 값과 다른 칸은 두 값을 나란히 보여 준다. 그 사이 다른 곳에서 고쳤으면
 *    서버가 409로 멈추고 여기서 다시 읽는다(덮지 않는다).
 *  - 근거는 원문 줄 그대로(몇 쪽의 어떤 줄)를 보여 준다.
 *  - 목차가 없으면 "미확보"라고 말하고 다음 행동을 준다. 책 이름만으로 목차를 만들지 않는다. 계획·학습은 그대로 된다.
 */

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { textbookAPI } from '../../api/api.js';

import '../../styles/learning-flow.css';
const FIELD_LABEL = { title: '제목', author: '저자', publisher: '출판사', isbn: 'ISBN', edition: '판' };
const SOURCE_LABEL = { USER: '직접 적음', MATERIAL: '자료에서 찾아 적용함' };

export default function TextbookPanel({ courseId, refreshToken = 0, onChanged }) {
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState({});
  const [tocOpen, setTocOpen] = useState(false);

  const load = useCallback(async () => {
    if (!textbookAPI?.get) return;
    try {
      const next = await textbookAPI.get(courseId);
      setReview(next);
      setError(null);
      // 지금 값과 다른 칸만 기본 선택. 지금 값이 있는 칸은 사용자가 직접 골라야 한다(조용히 덮지 않는다).
      const initial = {};
      (next?.candidates ?? []).forEach((c) => c.fields.forEach((f) => {
        if (!f.same && !f.current) initial[`${c.materialId}:${f.field}`] = true;
      }));
      setPicked(initial);
    } catch (err) {
      setError(err.message || '교재 정보를 불러오지 못했어요.');
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load, refreshToken]);

  if (!review && !error) return null;

  const current = review?.current ?? {};
  const currentLine = ['title', 'author', 'publisher', 'edition'].map((k) => current[k]).filter(Boolean).join(' · ');

  const applyFrom = async (candidate) => {
    const values = {};
    const expected = {};
    candidate.fields.forEach((f) => {
      if (picked[`${candidate.materialId}:${f.field}`]) {
        values[f.field] = f.value;
        expected[f.field] = f.current ?? null;
      }
    });
    if (Object.keys(values).length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setReview(await textbookAPI.apply(courseId, { materialId: candidate.materialId, values, expected }));
      setPicked({});
      await onChanged?.();
    } catch (err) {
      // 지금 값을 다시 읽은 뒤에 이유를 보인다(다시 읽기가 오류 문구를 지우지 않게).
      await load();
      setError(err.message || '적용하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="view-section textbook-panel" aria-label="교재">
      <h2 className="section-title"><BookOpen size={15} /> 교재</h2>
      {error && <p className="view-error">{error}</p>}
      {review && (
        <>
          <p className="textbook-current">
            {currentLine || <span className="view-dim">아직 적힌 교재가 없어요.</span>}
            {current.isbn && <span className="view-sub-dim"> · ISBN {current.isbn}</span>}
            {SOURCE_LABEL[current.source] && <span className="chip chip-status">{SOURCE_LABEL[current.source]}</span>}
          </p>

          <p className={review.state === 'TOC_FOUND' ? 'view-sub-dim' : 'textbook-next'}>
            {review.state === 'TOC_FOUND' && (
              <>목차 확보: 「{review.toc.filename}」 p.{review.toc.fromUnit}{review.toc.toUnit !== review.toc.fromUnit ? `~${review.toc.toUnit}` : ''} · 장·절 {review.toc.entryCount}개. </>
            )}
            {review.nextAction}
          </p>

          {review.state === 'TOC_FOUND' && (
            <>
              <button type="button" className="collapse-head" aria-expanded={tocOpen} onClick={() => setTocOpen((v) => !v)}>
                {tocOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} 읽은 목차 보기
              </button>
              {tocOpen && (
                <ol className="textbook-toc">
                  {review.toc.entries.map((e, i) => (
                    <li key={i} style={{ paddingLeft: `${Math.max(0, e.level - 1) * 16}px` }}>
                      {e.number} {e.title}{e.page ? <span className="view-sub-dim"> · p.{e.page}</span> : null}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {(review.candidates ?? []).map((candidate) => {
            const open = candidate.fields.filter((f) => !f.same);
            if (open.length === 0) return null;
            return (
              <div key={candidate.materialId} className="textbook-candidate">
                <p className="textbook-candidate-head">「{candidate.filename}」에서 찾은 교재 정보 · 적용 전</p>
                <ul>
                  {open.map((f) => {
                    const key = `${candidate.materialId}:${f.field}`;
                    return (
                      <li key={key}>
                        <label>
                          <input type="checkbox" checked={!!picked[key]} disabled={busy}
                            onChange={() => setPicked((prev) => ({ ...prev, [key]: !prev[key] }))} />
                          <span className="textbook-field">{FIELD_LABEL[f.field]}</span> {f.value}
                        </label>
                        {f.current && (
                          <span className="textbook-conflict"> — 지금 값 「{f.current}」과 달라요. 고르면 바뀌어요</span>
                        )}
                        <span className="view-sub-dim textbook-quote"> p.{f.unit}: “{f.quote}”</span>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="btn-primary btn-sm" disabled={busy
                  || !open.some((f) => picked[`${candidate.materialId}:${f.field}`])}
                  onClick={() => applyFrom(candidate)}>
                  {busy ? <Loader2 size={13} className="spin" /> : null} 고른 칸 적용
                </button>
              </div>
            );
          })}
          {review.pending > 0 && (
            <p className="view-sub-dim">아직 원문을 읽는 중인 자료 {review.pending}개는 끝나면 다시 확인해요.</p>
          )}
        </>
      )}
    </section>
  );
}
