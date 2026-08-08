/**
 * 확정된 topic 트리. source/AI_DERIVED 배지와 진행 상태, 그리고 topic별 "질문하기"
 * 진입점을 함께 보여준다. 상태 변경은 사용자가 명시적으로 눌러야만 반영된다 —
 * 화면이 알아서 LEARNED로 넘기지 않는다.
 */

import { useState } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import {
  TopicProgressStatus,
  TOPIC_PROGRESS_STATUS_LABEL,
  TopicSourceType,
  TOPIC_SOURCE_TYPE_LABEL,
} from '../../types/learning.js';
import { topicAPI } from '../../api/api.js';
import LearningChat from './LearningChat.jsx';

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

export default function TopicTree({ topics, onProgressChanged }) {
  const [chatTopicId, setChatTopicId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const handleStatusChange = async (topic) => {
    const next = NEXT_STATUS[topic.progressStatus];
    setUpdatingId(topic.topicId);
    try {
      await topicAPI.updateProgress(topic.topicId, next);
      await onProgressChanged?.();
    } catch (err) {
      alert(err.message || '진행 상태 변경에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <ul className="learning-topic-tree">
      {topics.map((topic) => (
        <TopicNode
          key={topic.topicId}
          topic={topic}
          depth={0}
          updatingId={updatingId}
          onStatusChange={handleStatusChange}
          chatTopicId={chatTopicId}
          onToggleChat={(id) => setChatTopicId((cur) => (cur === id ? null : id))}
        />
      ))}
    </ul>
  );
}

function TopicNode({ topic, depth, updatingId, onStatusChange, chatTopicId, onToggleChat }) {
  const isChatOpen = chatTopicId === topic.topicId;

  return (
    <li className="learning-topic-node" style={{ marginLeft: depth * 16 }}>
      <div className="learning-topic-row">
        <span className="learning-topic-title">{topic.title}</span>
        <span
          className={`learning-badge learning-badge-${topic.sourceType === TopicSourceType.SOURCE ? 'source' : 'derived'}`}
          title={topic.sourceLocator || ''}
        >
          {TOPIC_SOURCE_TYPE_LABEL[topic.sourceType]}
        </span>
        <span className={`learning-badge learning-badge-status-${topic.progressStatus}`}>
          {TOPIC_PROGRESS_STATUS_LABEL[topic.progressStatus]}
        </span>

        <button
          type="button"
          className="v6-btn-small"
          disabled={updatingId === topic.topicId}
          onClick={() => onStatusChange(topic)}
        >
          {NEXT_ACTION_LABEL[topic.progressStatus]}
        </button>

        <button
          type="button"
          className="learning-icon-btn"
          onClick={() => onToggleChat(topic.topicId)}
          title="이 주제에 대해 질문하기"
        >
          <MessageCircleQuestion size={16} />
        </button>
      </div>

      {isChatOpen && <LearningChat topicId={topic.topicId} topicTitle={topic.title} />}

      {topic.children && topic.children.length > 0 && (
        <ul>
          {topic.children.map((child) => (
            <TopicNode
              key={child.topicId}
              topic={child}
              depth={depth + 1}
              updatingId={updatingId}
              onStatusChange={onStatusChange}
              chatTopicId={chatTopicId}
              onToggleChat={onToggleChat}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
