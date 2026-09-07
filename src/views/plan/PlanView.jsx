/**
 * 계획 화면.
 *
 * ★ 항목 목록은 항상 현재 execution_items를 본다. 스냅샷을 쓰지 않는다 — 스냅샷을 보여주면
 * 항목을 다른 날로 옮겨도 이 화면이 옛 상태를 계속 보여준다. "어디 갔지"는 회고가
 * `이동됨`으로 답한다. 계획 화면과 회고 화면의 책임을 나눈 것이 이 설계의 요점이다.
 *
 * 그래서 이번 주 항목을 다음 주로 옮기면 이번 주 계획 화면에서 사라진다. 의도한 동작이다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { planAPI } from '../../api/api.js';
import {
  PLAN_INTENSITY_LABEL, PLAN_REVIEW_CATEGORY_LABEL, PLAN_REVIEW_MOVE_FLAG_LABEL,
} from '../../types/execution.js';
import { addDays, formatDateKo, formatMinutes, formatMinutesKo, toIsoDate } from '../../lib/planTime.js';

export default function PlanView({ planVersionId, projectTitles = {}, onBack, onChanged }) {
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);
  const [placeResult, setPlaceResult] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await planAPI.get(planVersionId);
      setPlan(loaded);
      // ★ 이 계획의 항목만 읽는다. 기간만으로 거르면 같은 기간의 다른 계획 항목이
      // 섞여 "이번 주에 뭐 하지"에 남의 계획이 끼어든다. 서버가 planKey로 걸러준다.
      setItems(await planAPI.items(planVersionId));
    } catch (err) {
      setError(err.message || '계획을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [planVersionId]);

  useEffect(() => { load(); }, [load]);

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const placed = items.filter((item) => item.scheduledDate);
  const unplaced = items.filter((item) => !item.scheduledDate);

  const doneCount = items.filter((item) => item.status === 'DONE').length;

  /** 다음 창이 계획 범위 밖이면 배치할 것이 없으므로 버튼을 숨긴다. */
  const windowStart = plan && todayIso < plan.startDate ? plan.startDate : todayIso;
  const canPlace = plan && windowStart <= plan.endDate && unplaced.length > 0;

  /** 배치 해제. 계획 기간을 함께 보내 계획 안에 남게 한다(미분류로 내보내지 않는다). */
  const handleUnschedule = async (item) => {
    if (!plan || busyId) return;
    setBusyId(item.executionItemId);
    setError(null);
    try {
      await planAPI.unschedule(item.executionItemId, {
        planningStartDate: plan.startDate,
        planningEndDate: plan.endDate,
        version: item.version,
        reason: '날짜를 다시 뗐어요',
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || '날짜를 떼지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePlace = async () => {
    if (!canPlace || placing) return;
    setPlacing(true);
    setError(null);
    try {
      const result = await planAPI.place(planVersionId, windowStart);
      setPlaceResult(result);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || '배치하지 못했습니다.');
    } finally {
      setPlacing(false);
    }
  };

  if (loading && !plan) return <p className="muted">불러오는 중…</p>;
  if (!plan) return <p className="error-text">{error || '계획을 찾을 수 없어요.'}</p>;

  const windowEnd = minIso(addDays(windowStart, 6), plan.endDate);

  return (
    <section className="plan-view">
      <header className="view-head">
        <div>
          <h1><CalendarClock size={20} /> {plan.title}</h1>
          <p className="plan-view-period">
            {formatDateKo(plan.startDate)} ~ {formatDateKo(plan.endDate)}
            {plan.intensity && <> · {PLAN_INTENSITY_LABEL[plan.intensity]}</>}
            {plan.targetMinutes != null && <> · 목표 {formatMinutes(plan.targetMinutes)}</>}
          </p>
          {plan.goalSummary && <p className="plan-view-goal">{plan.goalSummary}</p>}
        </div>
        {onBack && <button type="button" className="btn-ghost btn-sm" onClick={onBack}>뒤로</button>}
      </header>

      <p className="plan-view-progress">이번 계획: {items.length}개 중 {doneCount}개 완료</p>

      {error && <p className="error-text">{error}</p>}

      {placeResult && (
        <div className="plan-place-result">
          <p>
            {formatDateKo(placeResult.windowStart)} ~ {formatDateKo(placeResult.windowEnd)}에
            {' '}{placeResult.placed.length}개를 넣었어요.
          </p>
          {placeResult.unplaced.length > 0 && (
            <p className="muted">이번 주에는 자리가 없어 {placeResult.unplaced.length}개는 날짜 미정으로 남겨뒀어요.</p>
          )}
        </div>
      )}

      <div className="plan-section">
        <h2>날짜가 정해진 것 ({placed.length})</h2>
        {placed.length === 0 && <p className="muted">아직 날짜를 정한 항목이 없어요.</p>}
        <ul className="plan-item-list">
          {placed.map((item) => (
            <li key={item.executionItemId} className="plan-item">
              <span className="plan-item-title">{item.title}</span>
              <span className="plan-item-meta">
                {/*
                  executionItemAPI가 내려주는 항목은 toFrontendExecutionItem을 거치며
                  expectedMinutes → estimatedMinutes, scheduledStartAt → startTime('HH:mm')로
                  이름이 바뀐다. 원래 이름을 쓰면 조용히 undefined가 되어 값이 사라진다.
                */}
                {formatDateKo(item.scheduledDate)}
                {item.startTime && <> · {item.startTime}</>}
                {item.estimatedMinutes != null && <> · {item.estimatedMinutes}분</>}
                {item.courseId != null && projectTitles[item.courseId] && <> · {projectTitles[item.courseId]}</>}
              </span>
              <button type="button" className="btn-ghost btn-sm"
                disabled={busyId === item.executionItemId}
                onClick={() => handleUnschedule(item)}>
                날짜 떼기
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="plan-section">
        <h2>아직 날짜를 정하지 않은 것 ({unplaced.length})</h2>
        {unplaced.length === 0 && <p className="muted">전부 날짜가 정해졌어요.</p>}
        <ul className="plan-item-list">
          {unplaced.map((item) => (
            <li key={item.executionItemId} className="plan-item">
              <span className="plan-item-title">{item.title}</span>
              <span className="plan-item-meta">
                {item.estimatedMinutes != null && <>{item.estimatedMinutes}분</>}
                {item.courseId != null && projectTitles[item.courseId] && <> · {projectTitles[item.courseId]}</>}
              </span>
            </li>
          ))}
        </ul>

        {canPlace && (
          <button type="button" className="btn-primary" disabled={placing} onClick={handlePlace}>
            <RefreshCw size={16} />
            {placing ? '자리를 찾는 중…' : `${formatDateKo(windowStart)} ~ ${formatDateKo(windowEnd)} 배치하기`}
          </button>
        )}
        {!canPlace && unplaced.length > 0 && (
          <p className="muted">계획 기간이 지나 배치할 창이 없어요.</p>
        )}
      </div>
    </section>
  );
}

function minIso(a, b) {
  return a < b ? a : b;
}

/** 회고 화면. 스냅샷과 현재 상태를 대조한 결과만 보여준다 — 퍼센트는 계산하지 않는다. */
export function PlanReviewPanel({ planVersionId }) {
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    planAPI.review(planVersionId)
      .then((r) => { if (!cancelled) setReview(r); })
      .catch((err) => { if (!cancelled) setError(err.message || '회고를 불러오지 못했습니다.'); });
    return () => { cancelled = true; };
  }, [planVersionId]);

  if (error) return <p className="error-text">{error}</p>;
  if (!review) return <p className="muted">불러오는 중…</p>;

  return (
    <section className="plan-review">
      <h2>{review.title} 돌아보기</h2>
      <p className="plan-review-summary">
        {review.intensity ? `${PLAN_INTENSITY_LABEL[review.intensity]}으로 잡았고, ` : ''}
        {review.targetMinutes != null ? `${formatMinutesKo(review.targetMinutes)} 중 ` : ''}
        {formatMinutesKo(review.completedMinutes)}을 했어요.
      </p>
      <ul className="plan-review-list">
        {review.items.map((item) => (
          <li key={`${item.executionItemId}-${item.category}`} className="plan-review-item">
            <span className="plan-item-title">{item.title}</span>
            <span className="plan-item-meta">{categoryLabel(item)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 라벨은 types/execution.js의 상수를 쓴다 — 컴포넌트가 enum을 직접 한글화하지 않는다.
 * 그래야 "미완료" 같은 말이 화면마다 다르게 새는 것을 막을 수 있다.
 */
function categoryLabel(item) {
  const base = PLAN_REVIEW_CATEGORY_LABEL[item.category] ?? item.category;
  const flag = item.moveFlag ? PLAN_REVIEW_MOVE_FLAG_LABEL[item.moveFlag] : null;
  return flag ? `${flag} ${base}` : base;
}
