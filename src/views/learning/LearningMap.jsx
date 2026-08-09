/**
 * 확정된 topic 트리를 계층 그대로 보여주는 학습 지도.
 *
 * 평평한 카드 목록이 아니라 부모-자식 관계가 들여쓰기/접기-펼치기로 드러나야 한다.
 * 각 행은 상태 아이콘 + 제목만 보여준다 — provenance 배지, 진행 버튼, 질문하기 버튼처럼
 * 반복되는 조작은 여기 두지 않고 선택된 topic 하나만 보여주는 TopicDetail로 옮긴다.
 *
 * 기본 펼침 규칙: 모든 branch를 펼쳐두지 않는다. 현재 학습 중(IN_PROGRESS)인 topic이 있는
 * branch와, 지금 선택된 topic이 있는 branch만 자동으로 펼친다. 나머지는 접힌 채로 시작해
 * topic이 많아도 첫 화면이 길어지지 않는다. 사용자가 직접 펼친/접은 상태는 selection이
 * 바뀌어도 유지한다 — 자동 규칙은 "아직 사용자가 손대지 않은" branch에만 적용된다.
 */

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, CircleDot, Circle } from 'lucide-react';
import { TopicProgressStatus } from '../../types/learning.js';

const STATUS_ICON = {
  [TopicProgressStatus.LEARNED]: CheckCircle2,
  [TopicProgressStatus.IN_PROGRESS]: CircleDot,
  [TopicProgressStatus.NOT_STARTED]: Circle,
};

/** topic.topicId 집합: 현재 학습 중이거나 선택된 topic까지 이어지는 경로(자기 자신 포함). */
function computeAutoExpandIds(topics, selectedTopicId) {
  const expandIds = new Set();

  const markPath = (nodes, predicate) => {
    let anyMatch = false;
    for (const node of nodes) {
      const selfMatch = predicate(node);
      const childMatch = node.children?.length ? markPath(node.children, predicate) : false;
      if (selfMatch || childMatch) {
        expandIds.add(node.topicId);
        anyMatch = true;
      }
    }
    return anyMatch;
  };

  markPath(topics, (t) => t.progressStatus === TopicProgressStatus.IN_PROGRESS);
  if (selectedTopicId != null) {
    markPath(topics, (t) => t.topicId === selectedTopicId);
  }
  return expandIds;
}

export default function LearningMap({ topics, selectedTopicId, onSelectTopic }) {
  const autoExpandIds = useMemo(
    () => computeAutoExpandIds(topics, selectedTopicId),
    [topics, selectedTopicId],
  );

  return (
    <ul className="learning-map">
      {topics.map((topic) => (
        <LearningMapNode
          key={topic.topicId}
          topic={topic}
          depth={0}
          selectedTopicId={selectedTopicId}
          onSelectTopic={onSelectTopic}
          autoExpandIds={autoExpandIds}
        />
      ))}
    </ul>
  );
}

function LearningMapNode({ topic, depth, selectedTopicId, onSelectTopic, autoExpandIds }) {
  const hasChildren = topic.children && topic.children.length > 0;
  // null = 사용자가 아직 손대지 않음 -> 자동 규칙을 따른다. true/false면 사용자가 직접 정한 값을 유지한다.
  const [manualExpanded, setManualExpanded] = useState(null);
  const expanded = manualExpanded !== null ? manualExpanded : autoExpandIds.has(topic.topicId);
  const StatusIcon = STATUS_ICON[topic.progressStatus] ?? Circle;
  const isSelected = selectedTopicId === topic.topicId;

  return (
    <li className="learning-map-node">
      <div
        className={`learning-map-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 18 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="learning-map-toggle"
            onClick={() => setManualExpanded(!expanded)}
            aria-label={expanded ? '접기' : '펼치기'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="learning-map-toggle-spacer" />
        )}

        <button
          type="button"
          className={`learning-map-title-btn learning-map-status-${topic.progressStatus}`}
          onClick={() => onSelectTopic?.(topic)}
        >
          <StatusIcon size={14} className="learning-map-status-icon" />
          <span className="learning-map-title">{topic.title}</span>
        </button>
      </div>

      {hasChildren && expanded && (
        <ul>
          {topic.children.map((child) => (
            <LearningMapNode
              key={child.topicId}
              topic={child}
              depth={depth + 1}
              selectedTopicId={selectedTopicId}
              onSelectTopic={onSelectTopic}
              autoExpandIds={autoExpandIds}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
