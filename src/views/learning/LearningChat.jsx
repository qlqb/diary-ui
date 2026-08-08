/**
 * topic 하나에 대한 Learning Agent 개인과외 대화. conversationAPI(Today 상담)와 달리
 * SSE 스트리밍이 아니라 동기 요청/응답이다 — AiPanelShell을 재사용하지 않고, 이 topic
 * 맥락에만 쓰는 작은 채팅 UI를 별도로 둔다.
 */

import { useState } from 'react';
import { learningConversationAPI } from '../../api/api.js';

export default function LearningChat({ topicId, topicTitle }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

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
    <div className="learning-chat">
      <p className="learning-chat-hint">{topicTitle}에 대해 궁금한 걸 물어보세요.</p>
      <div className="learning-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`learning-chat-bubble learning-chat-bubble-${m.role.toLowerCase()}`}>
            {m.content}
          </div>
        ))}
        {sending && <div className="learning-chat-bubble learning-chat-bubble-assistant">...</div>}
      </div>
      {error && <p className="learning-error">{error}</p>}
      <form className="learning-chat-input-row" onSubmit={handleSend}>
        <input
          type="text"
          className="learning-input"
          placeholder="예: prev 포인터가 왜 필요한지 모르겠어"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" className="v6-btn-small" disabled={sending || !input.trim()}>
          보내기
        </button>
      </form>
    </div>
  );
}
