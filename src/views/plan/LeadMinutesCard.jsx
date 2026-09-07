/**
 * "OO 전 이동시간은 얼마나 걸리나요?" — 아직 정하지 않은 반복 일정의 이동시간을 묻는 카드.
 *
 * 계획 초안을 만들기 전에 뜬다. 초안을 만들어 놓고 묻지 않는 이유는 PlanAskCard와 같다 —
 * 만들어진 계획이 기준점이 되어 답을 유도한다. 그리고 답이 없으면 초안이 수업 직전 시간에
 * 학습을 앉힌다.
 *
 * 그룹이 여럿이면 한 카드에 그룹별 한 줄이다. 전부 고르면 한 번에 보낸다. 「없음」은 0으로
 * 저장돼 다시 묻지 않고, 「나중에」는 아무것도 저장하지 않아 다음번에 다시 뜬다.
 *
 * 문구 규칙: 실패·미완료 같은 말을 쓰지 않는다. 아직 정하지 않았을 뿐이다.
 */

import { useState } from 'react';
import { LEAD_MINUTES_MAX, formatSample, parseCustomMinutes } from './leadMinutes.js';

const CHOICES = [
  { key: '30', label: '30분', minutes: 30 },
  { key: '60', label: '1시간', minutes: 60 },
  { key: '90', label: '1시간 30분', minutes: 90 },
  { key: 'none', label: '없음', minutes: 0 },
  { key: 'custom', label: '직접 입력', minutes: null },
];

/** 한 그룹의 선택 상태 → 분. 아직 고르지 않았거나 직접 입력이 유효하지 않으면 null. */
function minutesOf(answer) {
  if (!answer?.choice) return null;
  if (answer.choice === 'custom') return parseCustomMinutes(answer.custom);
  return CHOICES.find((c) => c.key === answer.choice)?.minutes ?? null;
}

/**
 * @param groups   [{ groupKey, label, routineIds, sample }]
 * @param onSubmit ([{ routineId, leadMinutes }]) => void. 전 그룹의 답을 루틴 단위로 펼쳐 보낸다
 * @param onLater  () => void. 저장 없이 넘어간다
 */
export default function LeadMinutesCard({ groups, onSubmit, onLater, busy = false, error = null }) {
  const [answers, setAnswers] = useState({});

  if (!groups?.length) return null;

  const setAnswer = (groupKey, patch) => setAnswers((prev) => ({
    ...prev,
    [groupKey]: { ...(prev[groupKey] ?? {}), ...patch },
  }));

  const complete = groups.every((g) => minutesOf(answers[g.groupKey]) != null);

  const submit = () => {
    if (!complete || busy) return;
    const entries = [];
    for (const group of groups) {
      const leadMinutes = minutesOf(answers[group.groupKey]);
      for (const routineId of group.routineIds) entries.push({ routineId, leadMinutes });
    }
    onSubmit?.(entries);
  };

  const single = groups.length === 1;

  return (
    <section className="lead-minutes-card" aria-label="이동시간">
      <p className="lead-minutes-question">
        {single
          ? `${groups[0].label} 전 이동시간은 얼마나 걸리나요?`
          : '이 일정들 전 이동시간은 얼마나 걸리나요?'}
      </p>
      <p className="hint">
        아직 정하지 않았어요. 정해 두면 계획이 그 시간을 비워 둬요.
      </p>

      <ul className="lead-minutes-rows">
        {groups.map((group) => {
          const answer = answers[group.groupKey] ?? {};
          const sample = formatSample(group.sample);
          return (
            <li key={group.groupKey} className="lead-minutes-row">
              <div className="lead-minutes-row-head">
                <span className="lead-minutes-label">{group.label}</span>
                {sample && <span className="lead-minutes-sample">{sample}{group.sample?.length >= 3 ? ' …' : ''}</span>}
              </div>
              <div className="lead-minutes-choices" role="group" aria-label={`${group.label} 이동시간`}>
                {CHOICES.map((choice) => (
                  <button
                    key={choice.key}
                    type="button"
                    className={`chip-toggle${answer.choice === choice.key ? ' is-on' : ''}`}
                    aria-pressed={answer.choice === choice.key}
                    disabled={busy}
                    onClick={() => setAnswer(group.groupKey, { choice: choice.key })}
                  >
                    {choice.label}
                  </button>
                ))}
                {answer.choice === 'custom' && (
                  <label className="lead-minutes-custom">
                    <input
                      type="number"
                      min={0}
                      max={LEAD_MINUTES_MAX}
                      step={5}
                      inputMode="numeric"
                      aria-label={`${group.label} 이동시간(분)`}
                      value={answer.custom ?? ''}
                      disabled={busy}
                      onChange={(e) => setAnswer(group.groupKey, { custom: e.target.value })}
                    />
                    <span>분</span>
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="error-text">{error}</p>}

      <div className="lead-minutes-actions">
        <button type="button" className="btn-primary btn-sm" disabled={!complete || busy} onClick={submit}>
          {busy ? '저장하고 있어요…' : '이대로 저장'}
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => onLater?.()}>
          나중에
        </button>
      </div>
    </section>
  );
}
