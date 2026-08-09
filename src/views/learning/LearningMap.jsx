/**
 * 확정된 topic 트리를 계층 그대로 보여주는 학습 지도.
 *
 * 평평한 카드 목록이 아니라 부모-자식 관계가 들여쓰기/접기-펼치기로 드러나야 한다.
 * 각 행은 상태 아이콘 + 제목만 보여준다 — provenance 배지, 진행 버튼, 질문하기 버튼처럼
 * 반복되는 조작은 여기 두지 않고 선택된 topic 하나만 보여주는 TopicDetail로 옮긴다.
 */

import { useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, CircleDot, Circle } from 'lucide-react';
import { TopicProgressStatus } from '../../types/learning.js';

const STATUS_ICON = {
  [TopicProgressStatus.LEARNED]: CheckCircle2,
  [TopicProgressStatus.IN_PROGRESS]: CircleDot,
  [TopicProgressStatus.NOT_STARTED]: Circle,
};

export default function LearningMap({ topics, selectedTopicId, onSelectTopic }) {
  return (
    <ul className="learning-map">
      {topics.map((topic) => (
        <LearningMapNode
          key={topic.topicId}
          topic={topic}
          depth={0}
          selectedTopicId={selectedTopicId}
          onSelectTopic={onSelectTopic}
        />
      ))}
    </ul>
  );
}

function LearningMapNode({ topic, depth, selectedTopicId, onSelectTopic }) {
  const hasChildren = topic.children && topic.children.length > 0;
  const [expanded, setExpanded] = useState(depth === 0);
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
            onClick={() => setExpanded((v) => !v)}
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
            />
          ))}
        </ul>
      )}
    </li>
  );
}
