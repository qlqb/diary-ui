/**
 * 계획을 만들기 전에 서버가 되물을 때 뜨는 카드.
 *
 * 초안을 만들어 놓고 "이게 맞나요?"라고 묻지 않는다 — 만들어진 계획은 그 자체로 화면의
 * 기준점이 되어, 사용자가 답을 고르기 전에 이미 대답을 유도한다. 그래서 이 카드가 뜰 때는
 * 조각이 하나도 없다.
 *
 * 「건너뛰기」는 「처음이에요」와 같은 답을 보낸다. 저장할 것이 없는 답이고, 그래야 사슬이
 * 끝난다 — 답을 안 보내면 다음 요청에서 서버가 같은 질문을 다시 던진다.
 */

import { FAMILIARITY_CHOICE, FALLBACK_FAMILIARITY_CHOICE } from '../../lib/planLabels.js';

export default function PlanAskCard({ ask, onAnswer, answering = false }) {
  if (!ask) return null;

  const send = (label) => {
    if (answering) return;
    onAnswer?.({
      familiarityAnswer: FAMILIARITY_CHOICE[label] ?? FALLBACK_FAMILIARITY_CHOICE,
      familiarityTopicIds: ask.topicIds ?? [],
    });
  };

  return (
    <section className="plan-ask">
      <p className="plan-ask-question">{ask.question}</p>
      <div className="plan-ask-options">
        {(ask.options ?? []).map((option) => (
          <button
            key={option}
            type="button"
            className="chip"
            disabled={answering}
            onClick={() => send(option)}
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={answering}
          onClick={() => send(null)}
        >
          건너뛰기
        </button>
      </div>
      {answering && <p className="hint">답을 반영해 다시 만들고 있어요…</p>}
    </section>
  );
}
