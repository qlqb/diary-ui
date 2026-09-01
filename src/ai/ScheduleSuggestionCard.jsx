/**
 * AI가 대화에서 뽑은 일정 후보 카드(약속 · 반복 일정).
 *
 * ★ 화면을 옮기지 않는다. [수정]은 같은 카드 안에서 편집 영역을 펼친다 — 일정 탭 폼으로
 * 데려가면 사용자가 방금 무슨 얘기를 하고 있었는지(대화 맥락)를 잃는다.
 *
 * 기본은 요약이다. 두 종류의 모든 필드를 처음부터 늘어놓은 카드는 만들지 않는다. 대부분의
 * 후보는 그대로 [적용]을 누르고 끝나고, 고칠 사람만 필드를 본다.
 *
 * 겉모양(제목·라벨·버튼 셋)은 하나이고 편집 body만 종류에 따라 갈린다. 두 종류의 필드를
 * 다 가진 범용 폼 객체를 만들지 않는다 — 그러면 "이 필드는 이 종류에서만 유효"라는 규칙이
 * 타입 밖으로 나가 주석으로만 남는다.
 */

import { useState } from 'react';
import { Check, MapPin, Repeat, X } from 'lucide-react';
import { formatDateShort, toHHmm } from '../lib/datetime.js';

const WEEKDAYS = [
  ['MONDAY', '월'], ['TUESDAY', '화'], ['WEDNESDAY', '수'], ['THURSDAY', '목'],
  ['FRIDAY', '금'], ['SATURDAY', '토'], ['SUNDAY', '일'],
];
const WEEKDAY_LABEL = Object.fromEntries(WEEKDAYS);

const KIND = {
  COMMITMENT: { label: '약속', Icon: MapPin },
  ROUTINE: { label: '반복 일정', Icon: Repeat },
};

/** "9/4 19:00 ~ 21:00" — 날짜가 넘어가면 종료 쪽 날짜도 보여준다. */
function commitmentRange(payload) {
  const startDate = String(payload.startAt ?? '').slice(0, 10);
  const endDate = String(payload.endAt ?? '').slice(0, 10);
  if (!startDate) return '';
  const tail = startDate === endDate
    ? toHHmm(payload.endAt)
    : `${formatDateShort(endDate)} ${toHHmm(payload.endAt)}`;
  return `${formatDateShort(startDate)} ${toHHmm(payload.startAt)} ~ ${tail}`;
}

function routineDays(payload) {
  const days = payload.daysOfWeek ?? [];
  if (days.length === 0) return '';
  return `매주 ${days.map((d) => WEEKDAY_LABEL[d] ?? d).join('·')}요일`;
}

function routineRange(payload) {
  if (!payload.effectiveFrom) return '';
  const from = `${formatDateShort(payload.effectiveFrom)}부터`;
  // 끝이 정해지지 않은 것은 정상값이다(알바·운동). 비었다고 빈칸으로 두면 잘못 입력한 것처럼 보인다.
  return payload.effectiveUntil
    ? `${from} ${formatDateShort(payload.effectiveUntil)}까지`
    : `${from} · 종료 없음`;
}

function splitLocal(value) {
  if (!value) return { date: '', time: '' };
  return { date: String(value).slice(0, 10), time: toHHmm(value) ?? '' };
}

/**
 * 날짜와 시각을 각각 state로 들고 있다가 합쳐 올린다.
 *
 * draft.startAt에서 매번 쪼개 쓰면, 시각을 지우는 순간 합친 값이 null이 되면서 날짜까지
 * 사라진다 — 사용자는 시각만 고치려 했는데 날짜를 다시 골라야 한다.
 */
function CommitmentEditor({ draft, onChange }) {
  const [start, setStart] = useState(() => splitLocal(draft.startAt));
  const [end, setEnd] = useState(() => splitLocal(draft.endAt));

  const push = (nextStart, nextEnd) => {
    setStart(nextStart);
    setEnd(nextEnd);
    onChange({
      ...draft,
      startAt: nextStart.date && nextStart.time ? `${nextStart.date}T${nextStart.time}` : null,
      endAt: nextEnd.date && nextEnd.time ? `${nextEnd.date}T${nextEnd.time}` : null,
    });
  };

  return (
    <div className="ai-schedule-editor">
      <label className="inline-field">
        <span>제목</span>
        <input value={draft.title ?? ''} aria-label="약속 제목"
          onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      </label>
      <label className="inline-field">
        <span>시작</span>
        <input type="date" value={start.date} aria-label="시작 날짜"
          onChange={(e) => push({ ...start, date: e.target.value }, end)} />
        <input type="time" step="300" value={start.time} aria-label="시작 시각"
          onChange={(e) => push({ ...start, time: e.target.value }, end)} />
      </label>
      <label className="inline-field">
        <span>종료</span>
        <input type="date" value={end.date} aria-label="종료 날짜"
          onChange={(e) => push(start, { ...end, date: e.target.value })} />
        <input type="time" step="300" value={end.time} aria-label="종료 시각"
          onChange={(e) => push(start, { ...end, time: e.target.value })} />
      </label>
      <label className="inline-field">
        <span>장소</span>
        <input value={draft.locationText ?? ''} placeholder="선택" aria-label="장소"
          onChange={(e) => onChange({ ...draft, locationText: e.target.value || null })} />
      </label>
    </div>
  );
}

function RoutineEditor({ draft, onChange }) {
  const days = draft.daysOfWeek ?? [];
  const toggleDay = (day) => onChange({
    ...draft,
    daysOfWeek: days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
  });

  return (
    <div className="ai-schedule-editor">
      <label className="inline-field">
        <span>제목</span>
        <input value={draft.title ?? ''} aria-label="반복 일정 제목"
          onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      </label>
      <div className="inline-field">
        <span>요일</span>
        <div className="ai-schedule-days">
          {WEEKDAYS.map(([value, label]) => (
            <button key={value} type="button"
              className={`chip-toggle${days.includes(value) ? ' is-on' : ''}`}
              aria-pressed={days.includes(value)}
              onClick={() => toggleDay(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="inline-field">
        <span>시간</span>
        <input type="time" step="300" value={draft.startTime ?? ''} aria-label="시작 시각"
          onChange={(e) => onChange({ ...draft, startTime: e.target.value })} />
        <input type="time" step="300" value={draft.endTime ?? ''} aria-label="종료 시각"
          onChange={(e) => onChange({ ...draft, endTime: e.target.value })} />
      </label>
      <label className="inline-field">
        <span>적용</span>
        <input type="date" value={draft.effectiveFrom ?? ''} aria-label="적용 시작일"
          onChange={(e) => onChange({ ...draft, effectiveFrom: e.target.value })} />
        <input type="date" value={draft.effectiveUntil ?? ''} aria-label="적용 종료일"
          onChange={(e) => onChange({ ...draft, effectiveUntil: e.target.value || null })} />
      </label>
      <label className="inline-field">
        <span>장소</span>
        <input value={draft.location ?? ''} placeholder="선택" aria-label="장소"
          onChange={(e) => onChange({ ...draft, location: e.target.value || null })} />
      </label>
    </div>
  );
}

/**
 * 적용할 수 있는 최소 조건. 서버가 거절할 값을 카드에서 먼저 막는다.
 *
 * 반복 일정의 endTime < startTime은 막지 않는다 — 18:00~02:00 야간 근무가 정상값이고,
 * 서버도 그것을 다음 날 종료로 읽는다. 같은 시각(길이 0)만 막는다.
 */
function isApplicable(kind, payload) {
  if (!payload?.title?.trim()) return false;
  if (kind === 'COMMITMENT') {
    return Boolean(payload.startAt && payload.endAt && payload.startAt < payload.endAt);
  }
  return Boolean(
    (payload.daysOfWeek ?? []).length > 0
    && payload.startTime && payload.endTime && payload.startTime !== payload.endTime
    && payload.effectiveFrom,
  );
}

export default function ScheduleSuggestionCard({ suggestion, state, onApply, onDismiss }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.payload ?? {});

  const kind = KIND[suggestion.kind] ?? { label: '일정', Icon: MapPin };
  const { Icon } = kind;
  const resolved = state?.status === 'applied' || state?.status === 'dismissed';
  const working = state?.status === 'working';
  const applicable = isApplicable(suggestion.kind, draft);

  if (resolved) {
    return (
      <div className="ai-schedule-card is-resolved">
        <p className="ai-schedule-title">{draft.title}</p>
        <p className="ai-schedule-resolved">
          {state.status === 'applied' ? '일정에 넣었어요.' : '넣지 않았어요.'}
        </p>
      </div>
    );
  }

  return (
    <div className="ai-schedule-card">
      <div className="ai-schedule-head">
        <span className="ai-schedule-title">{draft.title}</span>
        <span className="chip chip-block"><Icon size={11} /> {kind.label}</span>
      </div>

      {/* 요약은 접힌 상태에서도 무엇이 저장될지 다 말한다. */}
      {suggestion.kind === 'COMMITMENT' ? (
        <>
          <p className="ai-schedule-line">{commitmentRange(draft)}</p>
          {draft.locationText && <p className="ai-schedule-line">{draft.locationText}</p>}
        </>
      ) : (
        <>
          <p className="ai-schedule-line">{routineDays(draft)}</p>
          <p className="ai-schedule-line">{toHHmm(draft.startTime)} ~ {toHHmm(draft.endTime)}</p>
          <p className="ai-schedule-line">{routineRange(draft)}</p>
        </>
      )}

      {editing && (suggestion.kind === 'COMMITMENT'
        ? <CommitmentEditor draft={draft} onChange={setDraft} />
        : <RoutineEditor draft={draft} onChange={setDraft} />)}

      {state?.status === 'error' && <p className="ai-error">{state.message}</p>}

      <div className="ai-schedule-actions">
        <button type="button" className="btn-primary btn-sm" disabled={working || !applicable}
          onClick={() => onApply(suggestion.suggestionId, draft)}>
          <Check size={13} /> 적용
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={working}
          onClick={() => setEditing((v) => !v)}>
          수정
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={working}
          onClick={() => onDismiss(suggestion.suggestionId)}>
          <X size={13} /> 적용 안 함
        </button>
      </div>
    </div>
  );
}
