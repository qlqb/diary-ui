/**
 * 학습 지도에서 선택된 topic 하나의 상세.
 *
 * 모든 topic 행에 같은 배지·버튼 4개를 반복하는 대신, 선택한 topic에 대해서만
 * 계층 경로·출처(SOURCE/AI_DERIVED)와 상태, 하위 학습 내용, 학습 액션을 자세히 보여준다.
 * 상태 변경은 항상 사용자가 이 화면에서 명시적으로 눌러야만 반영된다 — 자동으로 넘어가지 않는다.
 */

import { useState } from 'react';
import { GraduationCap, MessageCircleQuestion } from 'lucide-react';
import { topicAPI } from '../../api/api.js';
import {
  TopicProgressStatus,
  TOPIC_PROGRESS_STATUS_LABEL,
  TopicSourceType,
  TOPIC_SOURCE_TYPE_LABEL,
} from '../../types/learning.js';

const NEXT_STATUS = {
  [TopicProgressStatus.NOT_STARTED]: TopicProgressStatus.IN_PROGRESS,
  [TopicProgressStatus.IN_PROGRESS]: TopicProgressStatus.LEARNED,
  [TopicProgressStatus.LEARNED]: TopicProgressStatus.NOT_STARTED,
};

const NEXT_ACTION_LABEL = {
  [TopicProgressStatus.NOT_STARTED]: '학습 시작',
  [TopicProgressStatus.IN_PROGRESS]: '학습 완료 처리',
  [TopicProgressStatus.LEARNED]: '다시 학습하기로',
};

function formatDateKo(value) {
  if (!value) return '아직 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '아직 없음';
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export default function TopicDetail({ courseTitle, ancestors, topic, onProgressChanged, onStartTutor }) {
  const [updating, setUpdating] = useState(false);

  if (!topic) {
    return (
      <div className="topic-detail topic-detail-empty">
        <p className="v6-section-desc">왼쪽 학습 지도에서 항목을 선택하면 상세 정보가 여기 나타나요.</p>
      </div>
    );
  }

  const handleStatusChange = async () => {
    setUpdating(true);
    try {
      await topicAPI.updateProgress(topic.topicId, NEXT_STATUS[topic.progressStatus]);
      await onProgressChanged?.();
    } catch (err) {
      alert(err.message || '진행 상태 변경에 실패했습니다.');
    } finally {
      setUpdating(false);
    }
  };

  const parent = ancestors && ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;
  const isSource = topic.sourceType === TopicSourceType.SOURCE;
  const children = topic.children ?? [];

  return (
    <div className="topic-detail">
      <h3 className="topic-detail-title">{topic.title}</h3>

      {(courseTitle || (ancestors && ancestors.length > 0)) && (
        <div className="topic-detail-row topic-detail-path-row">
          <span className="topic-detail-key">경로</span>
          <span className="topic-detail-path">
            {courseTitle}
            {(ancestors ?? []).map((a) => (
              <span key={a.topicId}> <span className="topic-detail-path-sep">›</span> {a.title}</span>
            ))}
          </span>
        </div>
      )}

      <div className="topic-detail-row">
        <span className="topic-detail-key">상태</span>
        <span className={`learning-badge learning-badge-status-${topic.progressStatus}`}>
          {TOPIC_PROGRESS_STATUS_LABEL[topic.progressStatus]}
        </span>
      </div>

      <div className="topic-detail-row topic-detail-source-row">
        <span className="topic-detail-key">출처</span>
        <div className="topic-detail-source-body">
          <span className={`learning-badge learning-badge-${isSource ? 'source' : 'derived'}`}>
            {TOPIC_SOURCE_TYPE_LABEL[topic.sourceType]}
          </span>
          {isSource && topic.sourceLocator && (
            <span className="topic-detail-source-locator">{topic.sourceLocator}</span>
          )}
          {!isSource && (
            <span className="topic-detail-source-locator">
              {parent ? `상위 근거: ${parent.title}${parent.sourceLocator ? ` (${parent.sourceLocator})` : ''}` : '원문 근거 없이 AI가 세분화했어요'}
            </span>
          )}
        </div>
      </div>

      {children.length > 0 && (
        <div className="topic-detail-children">
          <span className="topic-detail-key">이 주제에서 배울 내용</span>
          <ul className="topic-detail-children-list">
            {children.map((child) => (
              <li key={child.topicId}>{child.title}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="topic-detail-row">
        <span className="topic-detail-key">관련 자료</span>
        <span className="topic-detail-val">자료 탭에서 원본 자료를 확인할 수 있어요.</span>
      </div>

      <div className="topic-detail-row">
        <span className="topic-detail-key">최근 학습</span>
        <span className="topic-detail-val">{formatDateKo(topic.lastStudiedAt)}</span>
      </div>

      {topic.reviewCount > 0 && (
        <div className="topic-detail-row">
          <span className="topic-detail-key">복습</span>
          <span className="topic-detail-val">{topic.reviewCount}회</span>
        </div>
      )}

      <div className="topic-detail-actions">
        <button type="button" className="v6-btn-small" disabled={updating} onClick={handleStatusChange}>
          <GraduationCap size={14} /> {NEXT_ACTION_LABEL[topic.progressStatus]}
        </button>
        <button type="button" className="btn-primary topic-detail-tutor-btn" onClick={() => onStartTutor?.(topic)}>
          <MessageCircleQuestion size={14} /> AI 과외 시작
        </button>
      </div>
    </div>
  );
}
