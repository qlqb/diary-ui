/**
 * 계획 상담 첫머리 질문. 빈 입력창 앞의 막막함을 데이터에서 나온 구체적인 질문 몇 개로 바꾼다
 * (handoff plan-experience-plan-2026-11-20 §1 5단계). 질문은 서버가 고른다(겹침 → 마감 → 쓸 시간).
 *
 * 답을 고르면 바로 보내지 않고, 고른 답들을 한 문장으로 이어 입력창을 채운다 — 이 패널의 다른 버튼들과 같은 규칙이다
 * (무엇을 보낼지는 사용자가 마지막으로 확인하고 고칠 수 있어야 한다). 사용자가 입력창에서 고친 글은 지우지 않는다 —
 * 그래서 화면에는 "새로 모은 문장"과 "직전에 모았던 문장", "새로 더한 답"을 함께 넘기고, 합치는 일은 입력창 주인이 한다.
 * 보낸 답은 평범한 사용자 발화라서 계획 생성기까지 그대로 간다. "직접 말할게요"(message 없음)는 그 질문의 답을 풀고 입력창을 연다.
 *
 * 질문 집합이 바뀌면 부모가 key를 바꿔 이 컴포넌트를 새로 만든다(고른 상태가 다른 질문에 남지 않게).
 */
import { useRef, useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@mantine/core';
const compose = (questions, picks) => questions
  .filter((q) => picks.has(q.id) && q.choices[picks.get(q.id)]?.message)
  .map((q) => q.choices[picks.get(q.id)].message)
  .join(' ');

export default function OpeningQuestions({ questions, onCompose, onFocusInput }) {
  const [picks, setPicks] = useState(() => new Map()); // questionId → choice index
  const lastComposed = useRef('');

  const apply = (next, added, removed) => {
    setPicks(next);
    const text = compose(questions, next);
    onCompose?.({ text, previous: lastComposed.current, added, removed });
    lastComposed.current = text;
  };
  const messageOf = (question, map) => (map.has(question.id) ? question.choices[map.get(question.id)]?.message ?? null : null);

  const pick = (question, index) => {
    const choice = question.choices[index];
    if (!choice) return;
    if (!choice.message) {
      // 직접 말하기 — 이 질문에 골라 둔 답이 있으면 풀어야 나중에 다른 답을 고를 때 되살아나지 않는다.
      if (picks.has(question.id)) {
        const next = new Map(picks);
        next.delete(question.id);
        apply(next, null, messageOf(question, picks));
      }
      onFocusInput?.('예: 이번 주는 공부에 8시간쯤 쓰고 싶어요');
      return;
    }
    const next = new Map(picks);
    const before = messageOf(question, picks);
    const removing = next.get(question.id) === index;
    if (removing) next.delete(question.id);
    else next.set(question.id, index);
    apply(next, removing ? null : choice.message, before);
  };

  return (
    <div className="opening-questions" role="group" aria-label="계획 전에 확인할 것">
      {questions.map((q) => (
        <div key={q.id} className="opening-question">
          <p className="opening-question-q">{q.question}</p>
          <div className="opening-question-choices">
            {q.choices.map((c, i) => {
              const on = picks.get(q.id) === i;
              return (
                <Button variant={on ? 'light' : 'default'} size="xs" key={c.label} type="button" className={`${on ? 'is-selected' : ''}`}
                  aria-pressed={c.message ? on : undefined} onClick={() => pick(q, i)}>
                  {on && <Check size={13} aria-hidden="true" />}{c.label}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
