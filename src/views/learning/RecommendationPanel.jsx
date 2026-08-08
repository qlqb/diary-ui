/**
 * Learning Agent 추천 -> Planning Agent 계획 초안 -> Apply 흐름.
 *
 * 추천을 받는 것과 계획을 짜는 것은 별개 액션이다(WHAT과 WHEN을 분리) — 사용자가
 * 각 단계에서 멈추거나 계속 진행할 수 있다. Apply를 누르기 전에는 ExecutionItem이
 * 전혀 생기지 않는다.
 */

import { useState } from 'react';
import { learningRecommendationAPI, planningAPI } from '../../api/api.js';
import { ACTIVITY_TYPE_LABEL } from '../../types/learning.js';

export default function RecommendationPanel({ courseId, onApplied }) {
  const [recommendation, setRecommendation] = useState(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [draft, setDraft] = useState(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  const handleRecommend = async () => {
    setLoadingRecommendation(true);
    setError(null);
    setDraft(null);
    try {
      const rec = await learningRecommendationAPI.recommend(courseId);
      setRecommendation(rec);
    } catch (err) {
      setError(err.message || '추천을 받지 못했습니다.');
    } finally {
      setLoadingRecommendation(false);
    }
  };

  const handlePlan = async () => {
    if (!recommendation) return;
    setLoadingDraft(true);
    setError(null);
    try {
      const result = await planningAPI.createDraft(recommendation.recommendationId, instruction || null);
      setDraft(result);
    } catch (err) {
      setError(err.message || '계획 초안을 만들지 못했습니다.');
    } finally {
      setLoadingDraft(false);
    }
  };

  const handleApply = async () => {
    if (!draft) return;
    setApplying(true);
    setError(null);
    try {
      await planningAPI.apply(draft.proposalId);
      setDraft(null);
      setRecommendation(null);
      await onApplied?.();
      alert('오늘/시간표 화면에 반영됐어요.');
    } catch (err) {
      setError(err.message || '계획 적용에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="learning-recommendation-panel">
      <button type="button" className="v6-btn-small" onClick={handleRecommend} disabled={loadingRecommendation}>
        {loadingRecommendation ? '추천 받는 중...' : '다음 학습 추천 받기'}
      </button>

      {error && <p className="learning-error">{error}</p>}

      {recommendation && (
        <div className="learning-recommendation-card">
          <div className="v6-item-meta">
            <span className="learning-badge">{ACTIVITY_TYPE_LABEL[recommendation.activityType]}</span>
            <span className="v6-item-tag">{recommendation.topicTitle}</span>
            {recommendation.recommendedMinutesIdeal && (
              <span className="v6-item-tag">약 {recommendation.recommendedMinutesIdeal}분</span>
            )}
          </div>
          <p className="v6-section-desc">{recommendation.reason}</p>

          {!draft && (
            <div className="learning-chat-input-row">
              <input
                type="text"
                className="learning-input"
                placeholder='예: "이번 주에 공부하게 계획해줘" (비워두면 이번 주 기본 배치)'
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <button type="button" className="v6-btn-small" onClick={handlePlan} disabled={loadingDraft}>
                {loadingDraft ? '계획 짜는 중...' : '이번 주로 계획하기'}
              </button>
            </div>
          )}
        </div>
      )}

      {draft && (
        <div className="learning-plan-draft">
          <h3 className="v6-section-title">계획 초안 ({draft.horizonStart} ~ {draft.horizonEnd})</h3>
          {(draft.preview?.placedItems ?? []).map((item) => (
            <div key={item.proposalItemId} className="v6-item-card">
              <div className="v6-item-main">
                <span className="v6-item-title-button">{item.title}</span>
                <div className="v6-item-meta">
                  <span className="v6-item-placement">
                    {item.scheduledDate} {item.scheduledStartAt?.slice(11, 16)}~{item.scheduledEndAt?.slice(11, 16)}
                  </span>
                </div>
                <p className="v6-section-desc">{item.reason}</p>
              </div>
            </div>
          ))}
          {(draft.preview?.unplacedItems ?? []).length > 0 && (
            <p className="learning-error">배치하지 못한 항목이 있어요 — 가용 시간을 확인해주세요.</p>
          )}
          <div className="learning-chat-input-row">
            <button type="button" className="v6-btn-small" onClick={handleApply} disabled={applying}>
              {applying ? '적용 중...' : '이 계획 적용하기'}
            </button>
            <button type="button" className="v6-btn-small" onClick={() => setDraft(null)} disabled={applying}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
