/**
 * "남은 오늘 다시 잡기" 검토 영역.
 *
 * 오늘 화면 안에 그대로 펼친다 — 새 페이지나 전체 화면 모달로 보내지 않는다. 계획이 틀어진
 * 순간에 화면이 통째로 바뀌면 방금 보던 것("지금 뭐가 밀렸지")을 잃기 때문이다.
 *
 * 이 영역이 지키는 순서:
 *   재조정안 생성 -> 사용자가 검토 -> 수정 -> 적용 -> 실제 데이터 변경
 * 열었다고 아무것도 바뀌지 않고, 닫으면 저장된 계획은 그대로다. 초안은 이 컴포넌트의 state에만
 * 있고 실제 항목과 섞이지 않는다.
 *
 * 현재 상황(기상 늦음 등)은 새 테이블을 만들지 않는다 — 선택한 태그는 각 도메인 액션의 reason에
 * 실려 execution_item_events에 그대로 남는다. 나중에 "기상 늦음이던 날 무엇을 옮겼나"를 되짚는
 * 근거는 그 이벤트다.
 */

import { useMemo, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import {
  DECISIONS, applyReschedule, buildRescheduleDraft, freeWindow, hasChange,
} from '../../lib/reschedule.js';
import { formatDateShort, formatMinutes, hhmmOf, minutesOf, shiftDate } from '../../lib/datetime.js';
import { isTimed } from '../../lib/today.js';

/**
 * 고정된 enum이 아니라 자주 쓰는 말의 목록이다. 사용자가 아무것도 고르지 않아도 재조정은 된다 —
 * 상황을 설명해야만 계획을 고칠 수 있게 만들지 않는다.
 */
const SITUATION_TAGS = [
  '기상 늦음', '수면 부족', '예상보다 오래 걸림', '컨디션 저하', '갑작스러운 일정', '일정 과밀',
];

const DECISION_LABELS = [
  { value: DECISIONS.LATER_TODAY, label: '오늘 뒤로' },
  { value: DECISIONS.TOMORROW, label: '내일로' },
  { value: DECISIONS.PICK_DATE, label: '날짜 선택' },
  { value: DECISIONS.HOLD, label: '보류' },
  { value: DECISIONS.KEEP, label: '유지' },
];

export default function ReschedulePanel({
  overdue, upcoming, items, now, today, onClose, onApplied, onAskAi,
}) {
  // 초안은 열 때 한 번만 계산한다. 이후에는 사용자가 고친 값이 진실이다 —
  // 1분마다 추천이 슬금슬금 바뀌면 검토 중인 화면이 발밑에서 움직인다.
  const [entries, setEntries] = useState(() => buildRescheduleDraft(overdue, upcoming, now, today));
  const [tags, setTags] = useState([]);
  const [applying, setApplying] = useState(false);
  const [failures, setFailures] = useState([]);

  const itemsById = useMemo(
    () => new Map((items ?? []).map((i) => [i.executionItemId, i])),
    [items],
  );
  const window = useMemo(() => freeWindow(now, upcoming), [now, upcoming]);

  const patch = (executionItemId, changes) => {
    setEntries((prev) => prev.map((e) => (e.executionItemId === executionItemId ? { ...e, ...changes } : e)));
  };

  const chooseDecision = (entry, decision) => {
    if (decision === DECISIONS.LATER_TODAY) {
      const start = entry.startTime ?? entry.recommended?.startTime ?? hhmmOf(window.start);
      patch(entry.executionItemId, {
        decision,
        toDate: today,
        startTime: start,
        endTime: hhmmOf(minutesOf(start) + entry.expectedMinutes),
      });
      return;
    }
    if (decision === DECISIONS.TOMORROW) {
      patch(entry.executionItemId, { decision, toDate: shiftDate(today, 1), startTime: null, endTime: null });
      return;
    }
    if (decision === DECISIONS.PICK_DATE) {
      patch(entry.executionItemId, {
        decision,
        toDate: entry.toDate && entry.toDate !== today ? entry.toDate : shiftDate(today, 1),
        startTime: null,
        endTime: null,
      });
      return;
    }
    patch(entry.executionItemId, { decision, toDate: null, startTime: null, endTime: null });
  };

  const setStart = (entry, startTime) => {
    const start = minutesOf(startTime);
    patch(entry.executionItemId, {
      startTime,
      endTime: start != null ? hhmmOf(start + entry.expectedMinutes) : entry.endTime,
    });
  };

  const setMinutes = (entry, minutes) => {
    const start = minutesOf(entry.startTime);
    patch(entry.executionItemId, {
      expectedMinutes: minutes,
      endTime: start != null && minutes > 0 ? hhmmOf(start + minutes) : entry.endTime,
    });
  };

  const changed = entries.filter(hasChange);

  const handleApply = async () => {
    setApplying(true);
    setFailures([]);
    const reason = tags.length > 0 ? `다시 잡기: ${tags.join(', ')}` : '다시 잡기';
    const result = await applyReschedule(entries, itemsById, reason);
    setApplying(false);
    if (result.failures.length > 0) {
      setFailures(result.failures);
      await onApplied?.();
      return;
    }
    await onApplied?.();
    onClose?.();
  };

  const handleAskAi = () => {
    onAskAi?.(buildAiPrompt(entries, tags, now, window));
  };

  return (
    <section className="reschedule" aria-label="오늘 계획 다시 잡기">
      <header className="reschedule-head">
        <div>
          <h2 className="section-title">오늘 계획 다시 잡기</h2>
          <p className="section-desc">
            현재 {hhmmOf(now)} · 예정 시간이 지난 항목 {overdue.length}개 ·
            {window.end > window.start
              ? ` ${window.boundary ? `${window.boundary.startTime} ${window.boundary.title} 전까지` : '오늘'} ${formatMinutes(window.end - window.start)} 남음`
              : ' 오늘 남은 시간이 거의 없어요'}
            <br />
            아직 아무것도 바뀌지 않았어요. 아래에서 고치고 적용을 눌러야 반영돼요.
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="다시 잡기 닫기">
          <X size={16} />
        </button>
      </header>

      <div className="reschedule-tags">
        <span className="reschedule-tags-label">현재 상황</span>
        {SITUATION_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`btn-ghost btn-sm${tags.includes(tag) ? ' is-selected' : ''}`}
            aria-pressed={tags.includes(tag)}
            onClick={() => setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))}
          >
            {tag}
          </button>
        ))}
      </div>

      <ul className="reschedule-list">
        {entries.map((entry) => (
          <li key={entry.executionItemId} className="reschedule-item">
            <div className="reschedule-item-head">
              <span className="reschedule-item-title">{entry.title}</span>
              <span className="exec-row-dim">기존 {entry.beforeStartTime}–{entry.beforeEndTime}</span>
              {entry.recommended && (
                <span className="chip chip-warn">추천 · {entry.recommended.reasonText}</span>
              )}
            </div>

            <div className="reschedule-item-actions">
              {DECISION_LABELS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`btn-ghost btn-sm${entry.decision === option.value ? ' is-selected' : ''}`}
                  aria-pressed={entry.decision === option.value}
                  onClick={() => chooseDecision(entry, option.value)}
                >
                  {option.label}
                </button>
              ))}

              {entry.decision === DECISIONS.LATER_TODAY && (
                <>
                  <label className="inline-field">
                    <span>시작</span>
                    <input type="time" step="300" value={entry.startTime ?? ''}
                      onChange={(e) => setStart(entry, e.target.value)} />
                  </label>
                  <label className="inline-field">
                    <span>분</span>
                    <input type="number" min="5" step="5" value={entry.expectedMinutes}
                      onChange={(e) => setMinutes(entry, Number(e.target.value) || 0)} />
                  </label>
                </>
              )}

              {entry.decision === DECISIONS.PICK_DATE && (
                <label className="inline-field">
                  <span>날짜</span>
                  <input type="date" value={entry.toDate ?? ''}
                    onChange={(e) => patch(entry.executionItemId, { toDate: e.target.value })} />
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="reschedule-preview">
        <p className="reschedule-preview-title">조정 후 오늘</p>
        <PreviewList entries={entries} upcoming={upcoming} today={today} />
      </div>

      {failures.length > 0 && (
        <div className="view-error">
          <p>일부 항목을 바꾸지 못했어요. 나머지는 반영됐어요.</p>
          <ul>
            {failures.map((failure) => (
              <li key={failure.title}>{failure.title}: {failure.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="reschedule-foot">
        <button type="button" className="btn-ghost" onClick={handleAskAi}>
          <Sparkles size={14} /> AI에게 다시 조정 요청
        </button>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={applying}>
          취소
        </button>
        <button type="button" className="btn-primary" onClick={handleApply} disabled={applying || changed.length === 0}>
          {applying ? <><Loader2 size={14} className="spin" /> 적용 중...</> : `이대로 적용 (${changed.length}개)`}
        </button>
      </div>
    </section>
  );
}

/** 적용하면 오늘이 어떻게 되는지. 그대로 두는 것과 앞으로 올 일정까지 한 줄로 보여준다. */
function PreviewList({ entries, upcoming, today }) {
  const kept = entries
    .filter((e) => e.decision === DECISIONS.LATER_TODAY || e.decision === DECISIONS.KEEP)
    .map((e) => ({
      key: `e-${e.executionItemId}`,
      startTime: e.decision === DECISIONS.KEEP ? e.beforeStartTime : e.startTime,
      endTime: e.decision === DECISIONS.KEEP ? e.beforeEndTime : e.endTime,
      title: e.title,
      minutes: e.expectedMinutes,
    }));
  const rest = (upcoming ?? []).map((i) => ({
    key: `u-${i.executionItemId}`,
    startTime: i.startTime,
    endTime: i.endTime,
    title: i.title,
    minutes: i.estimatedMinutes ?? 0,
    fixed: true,
  }));
  const moved = entries.filter((e) => e.decision === DECISIONS.TOMORROW || e.decision === DECISIONS.PICK_DATE);
  const held = entries.filter((e) => e.decision === DECISIONS.HOLD);

  const rows = [...kept, ...rest].sort((a, b) =>
    String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')));
  const totalMinutes = kept.reduce((sum, r) => sum + (r.minutes ?? 0), 0);

  return (
    <>
      {rows.length === 0 ? (
        <p className="view-dim">오늘 남는 항목이 없어요.</p>
      ) : (
        <ul className="reschedule-preview-list">
          {rows.map((row) => (
            <li key={row.key}>
              <span className="reschedule-preview-time">
                {row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : '시각 미정'}
              </span>
              <span>{row.title}</span>
              {row.fixed && <span className="chip">그대로</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="view-dim">
        다시 잡은 것 총 {formatMinutes(totalMinutes) || '0분'}
        {moved.length > 0 && ` · 다른 날로 ${moved.length}개`}
        {moved.length > 0 && moved.some((m) => m.toDate && m.toDate !== today)
          ? ` (${formatDateShort(moved[0].toDate)}${moved.length > 1 ? ' 외' : ''})` : ''}
        {held.length > 0 && ` · 보류 ${held.length}개`}
      </p>
    </>
  );
}

/**
 * AI에게 넘길 문장. 곧바로 보내지 않고 입력창을 채우기만 한다 — 무엇을 부탁할지는 사용자가
 * 마지막으로 확인하고 고칠 수 있어야 하고, 동의 없이 초안이 만들어지면 안 된다.
 */
function buildAiPrompt(entries, tags, now, window) {
  const situation = tags.length > 0 ? `${tags.join(', ')}으로 ` : '';
  const boundary = window.boundary && isTimed(window.boundary)
    ? ` ${window.boundary.startTime} ${window.boundary.title} 전까지 남은 시간에 맞춰`
    : '';
  return `지금 ${hhmmOf(now)}인데 ${situation}예정 시간이 지난 일정이 ${entries.length}개 있어.`
    + `${boundary} 남은 오늘을 다시 잡아줘.`;
}
