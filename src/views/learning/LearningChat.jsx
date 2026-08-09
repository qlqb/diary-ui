/**
 * TutorView 내부 채팅 본문. topic 하나에 대한 Learning Agent 개인과외 대화.
 *
 * conversationAPI(Today 상담)와 달리 SSE 스트리밍이 아니라 동기 요청/응답이다.
 * topicId를 항상 함께 보내므로 Learning Agent는 과목/주제를 다시 묻지 않는다 — 서버가
 * LearningContextBuilder로 course/topic/hierarchy/progress를 채워 넣는다.
 *
 * 메시지 영역만 내부 scroll된다 — 대화가 길어져도 TutorView 전체 페이지가 늘어나지 않는다.
 */

import { useEffect, useRef, useState } from 'react';
import { learningConversationAPI } from '../../api/api.js';

export default function LearningChat({ topicId, topicTitle }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages, sending]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { role: 'USER', content: text }]);
    setInput('');

    try {
      let convId = conversationId;
      if (!convId) {
        const created = await learningConversationAPI.create();
        convId = created.conversationId;
        setConversationId(convId);
      }
      const response = await learningConversationAPI.sendMessage(convId, topicId, text);
      setMessages((prev) => [...prev, { role: 'ASSISTANT', content: response.reply }]);
    } catch (err) {
      setError(err.message || '답변을 받지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tutor-chat">
      <div className="tutor-messages">
        {messages.length === 0 && (
          <p className="tutor-chat-hint">
            {topicTitle}에 대해 궁금한 걸 자유롭게 물어보세요. 지금 보고 있는 주제를 다시 설명하지 않아도 돼요.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`tutor-bubble tutor-bubble-${m.role.toLowerCase()}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="tutor-bubble tutor-bubble-assistant tutor-bubble-pending">...</div>}
        <div ref={bottomRef} />
      </div>

      {error && <p className="learning-error tutor-chat-error">{error}</p>}

      <form className="tutor-input-row" onSubmit={handleSend}>
        <input
          type="text"
          className="tutor-input"
          placeholder="궁금한 내용을 입력하세요"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" className="btn-primary tutor-send-btn" disabled={sending || !input.trim()}>
          보내기
        </button>
      </form>
    </div>
  );
}
