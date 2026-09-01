/**
 * 일회성 약속 입력 폼. 추가와 수정이 같은 폼을 쓴다.
 *
 * ★ 반복 옵션이 없다. 요일·주기·종료일 어느 것도 여기 없다 — 반복을 등록하려는 사용자는
 * 아래 반복 일정 UI를 쓴다. 여기에 반복을 열어 두면 같은 개념이 두 곳에 생기고, 화면이
 * 어느 쪽으로 저장할지를 매번 정해야 한다.
 *
 * 종료 날짜를 따로 받는다. 자정을 넘기는 약속(22:00~다음날 02:00)에서 종료 날짜를 추론하면
 * "밤 10시에 시작해 아침 2시에 끝난다"와 "밤 10시에 시작해 같은 날 새벽 2시"를 화면이
 * 대신 골라 버린다. 서버도 그런 추론을 하지 않으므로 여기서도 하지 않는다.
 */

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { toHHmm } from '../../lib/datetime.js';

/** 'YYYY-MM-DDTHH:mm:ss' -> 날짜와 시각으로 나눈다. 없으면 빈 값. */
function splitLocal(value) {
  if (!value) return { date: '', time: '' };
  return { date: String(value).slice(0, 10), time: toHHmm(value) ?? '' };
}

function toLocalDateTime(date, time) {
  return date && time ? `${date}T${time}` : null;
}

export default function CommitmentForm({ initial, busy, onSubmit, onCancel, submitLabel = '저장' }) {
  const start = splitLocal(initial?.startAt);
  const end = splitLocal(initial?.endAt);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startDate, setStartDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [locationText, setLocationText] = useState(initial?.locationText ?? '');

  const startAt = toLocalDateTime(startDate, startTime);
  const endAt = toLocalDateTime(endDate || startDate, endTime);
  // 서버와 같은 조건 하나로 길이 0과 역전을 함께 막는다.
  const valid = Boolean(title.trim() && startAt && endAt && startAt < endAt);

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      title: title.trim(),
      startAt,
      endAt,
      locationText: locationText.trim() || null,
    });
  };

  return (
    <form className="commitment-form" onSubmit={submit}>
      <label className="inline-field">
        <span>제목</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 친구 약속" aria-label="약속 제목" />
      </label>
      <label className="inline-field">
        <span>시작</span>
        <input type="date" value={startDate} aria-label="시작 날짜"
          onChange={(e) => {
            setStartDate(e.target.value);
            // 대부분 같은 날 안에서 끝난다. 다르면 사용자가 고친다.
            if (!endDate) setEndDate(e.target.value);
          }} />
        <input type="time" step="300" value={startTime} aria-label="시작 시각"
          onChange={(e) => setStartTime(e.target.value)} />
      </label>
      <label className="inline-field">
        <span>종료</span>
        <input type="date" value={endDate} aria-label="종료 날짜"
          onChange={(e) => setEndDate(e.target.value)} />
        <input type="time" step="300" value={endTime} aria-label="종료 시각"
          onChange={(e) => setEndTime(e.target.value)} />
      </label>
      <label className="inline-field">
        <span>장소</span>
        <input value={locationText} onChange={(e) => setLocationText(e.target.value)}
          placeholder="선택" aria-label="장소" />
      </label>
      <div className="commitment-form-actions">
        <button type="submit" className="btn-primary btn-sm" disabled={busy || !valid}>
          <Check size={13} /> {submitLabel}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
          <X size={13} /> 취소
        </button>
      </div>
    </form>
  );
}
