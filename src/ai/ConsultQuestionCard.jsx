/**
 * 상담 질문 카드. AI가 계획 방향을 정하려고 묻는 질문 하나를 보여 준다.
 *
 * ★ 선택지는 제안일 뿐이다. 카드가 떠 있어도 입력창은 늘 열려 있고, 직접 쓴 답이 선택지보다 덜한 답이
 *   아니다. 그래서 이 카드는 입력창을 막지도, 입력 중인 글을 건드리지도 않는다.
 * ★ 고른 답은 자유 입력과 같은 길(conversationAPI.sendMessage)로 간다 — 여기서는 "무엇을 골랐는지"만
 *   위로 올리고, 보내기는 패널이 한다. 고른 라벨이 대화 기록에 내 말로 남는다.
 * ★ 답하지 않을 길을 늘 둔다: 둘 다 아님 / 잘 모르겠어 / 건너뛰기 / 지금까지 얘기로 계획 / 나중에.
 *   "나중에 이어하기"는 아무것도 보내지 않는다. 카드를 접고 조용히 한 줄만 남긴다.
 * ★ 선택지의 뜻(kind)은 서버가 정한다. 답(kind 없음)은 누르면 내 답으로 간다. 입력 안내(INPUT, "시험 날짜 적기")는 답이
 *   아니라서 보내지 않고 입력창만 연다 — 예전에는 "과목명과 날짜 말하기"가 답으로 가서 같은 질문이 되풀이됐다. 자료 찾기
 *   (LOOKUP)와 "내 자료에서 찾아봐"는 AI가 자료를 더 넓게 확인하게 한다.
 */

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { LOOKUP_TEXT } from './consultLabels.js';

export default function ConsultQuestionCard({
  question, disabled = false, onAnswer, onPlanNow, onFocusInput,
}) {
  const [picked, setPicked] = useState(() => new Set());
  const [later, setLater] = useState(false);

  if (!question?.text) return null;
  const allChoices = question.choices ?? [];
  const choices = allChoices.filter((c) => !c.kind || c.kind === 'ANSWER');
  const inputChoices = allChoices.filter((c) => c.kind === 'INPUT');
  const lookupChoices = allChoices.filter((c) => c.kind === 'LOOKUP');
  const multi = Boolean(question.multiSelect) && choices.length > 1;

  if (later) {
    return (
      <p className="consult-later" role="status">
        이어서 할 수 있어요.
        {' '}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setLater(false)}>질문 다시 보기</button>
      </p>
    );
  }

  const send = (choiceIds, text, skipped = false, lookup = false) => {
    if (disabled) return;
    onAnswer?.({ questionId: question.id, choiceIds, skipped, lookup, text });
  };

  const toggle = (choice) => {
    if (!multi) {
      send([choice.id], choice.label);
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(choice.id)) next.delete(choice.id);
      else next.add(choice.id);
      return next;
    });
  };

  const sendPicked = () => {
    const chosen = choices.filter((c) => picked.has(c.id));
    if (chosen.length === 0) return;
    send(chosen.map((c) => c.id), chosen.map((c) => c.label).join(', '));
  };

  return (
    <section className="consult-question" aria-label="AI의 질문">
      <p className="consult-question-text"><HelpCircle size={14} aria-hidden="true" /> {question.text}</p>
      {question.why && <p className="consult-question-why">이걸 묻는 이유: {question.why}</p>}

      {choices.length > 0 && (
        <div className="consult-question-choices" role="group"
          aria-label={multi ? '선택지 (여러 개 고를 수 있어요)' : '선택지'}>
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`chip consult-chip${picked.has(choice.id) ? ' is-picked' : ''}`}
              aria-pressed={multi ? picked.has(choice.id) : undefined}
              disabled={disabled}
              onClick={() => toggle(choice)}
            >
              {/* 고른 상태는 색만이 아니라 글자(✓)로도 보인다. */}
              {multi && picked.has(choice.id) ? '✓ ' : ''}{choice.label}
            </button>
          ))}
        </div>
      )}
      {(inputChoices.length > 0 || lookupChoices.length > 0) && (
        <div className="consult-question-choices" role="group" aria-label="답하는 다른 방법">
          {inputChoices.map((choice) => (
            <button key={choice.id} type="button" className="chip consult-chip consult-chip-input"
              onClick={() => onFocusInput?.(choice.label)}>
              ✎ {choice.label}
            </button>
          ))}
          {lookupChoices.map((choice) => (
            <button key={choice.id} type="button" className="chip consult-chip consult-chip-lookup" disabled={disabled}
              onClick={() => send([choice.id], choice.label)}>
              {choice.label}
            </button>
          ))}
        </div>
      )}
      {multi && choices.length > 0 && (
        <div className="consult-question-multi">
          <span className="ai-hint">여러 개 고를 수 있어요 · {picked.size}개 고름</span>
          <button type="button" className="btn-primary btn-sm" disabled={disabled || picked.size === 0}
            onClick={sendPicked}>
            고른 답 보내기
          </button>
        </div>
      )}

      <div className="consult-question-escape" role="group" aria-label="다르게 답하기">
        {choices.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" disabled={disabled}
            onClick={() => send([], '둘 다 아님')}>
            둘 다 아님
          </button>
        )}
        <button type="button" className="btn-ghost btn-sm" disabled={disabled}
          onClick={() => send([], '잘 모르겠어')}>
          잘 모르겠어
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => onFocusInput?.()}>
          직접 말하기
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={disabled}
          onClick={() => send([], LOOKUP_TEXT, false, true)}>
          내 자료에서 찾아봐
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={disabled}
          onClick={() => send([], '이 질문은 건너뛸게요.', true)}>
          이 질문 건너뛰기
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={disabled} onClick={() => onPlanNow?.()}>
          지금까지 얘기로 계획해줘
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setLater(true)}>
          나중에 이어하기
        </button>
      </div>
    </section>
  );
}
