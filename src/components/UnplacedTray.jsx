/**
 * 계획 기간 안에 못 넣은 항목 묶음. 계획 검토(PlanDraftReview)와 일정 화면의 초안(ScheduleView)이 함께 쓴다.
 *
 * 배치 미리보기는 계획 기간 밖으로 항목을 넘기지 않는다 — 기간이 차면 남은 항목을 여기 모아 사용자가 고르게 한다.
 * 서버가 붙여 준 힌트(다음 빈 시간·줄이면 들어가는 길이)는 제안일 뿐이고, 버튼을 누르기 전엔 아무것도 놓지 않는다.
 *
 * item: { id, title, minutes, reason, nextSlot: {start, end} | null, fit: {minutes, start} | null,
 *         status: 'open' | 'placed' | 'deferred' | 'excluded', placedLabel? }
 * onPlace(id, { start, end, minutes? }) — minutes가 있으면 그 길이로 줄여 놓는다.
 */

import { useState } from 'react';
import { AlertTriangle, ArrowRight, Ban, CalendarClock, Clock3, Minimize2, RotateCcw } from 'lucide-react';
import { formatSlot, slotOf, slotParts as parts } from '../lib/unplacedSlot.js';
import '../styles/unplaced-tray.css';

function minutesLabel(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h}시간 ${m}분` : h ? `${h}시간` : `${m}분`;
}

export default function UnplacedTray({ items, defaultDate, onPlace, onExclude, onDefer, onUndo, deferLabel = '날짜 미정으로 두기' }) {
  const [manualId, setManualId] = useState(null);
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');

  if (!items || items.length === 0) return null;
  const open = items.filter((i) => i.status === 'open');

  const startManual = (item) => {
    setManualId(item.id);
    setManualDate(item.nextSlot ? parts(item.nextSlot.start).date : (defaultDate ?? ''));
    setManualTime(item.nextSlot ? parts(item.nextSlot.start).time : '');
  };
  const submitManual = (item) => {
    if (!manualDate || !manualTime || !item.minutes) return;
    onPlace(item.id, slotOf(manualDate, manualTime, item.minutes));
    setManualId(null);
  };

  return (
    <section className={`unplaced-tray${open.length === 0 ? ' is-done' : ''}`} aria-label="기간 안에 못 넣은 항목">
      <header className="unplaced-tray-head">
        <AlertTriangle size={15} aria-hidden="true" />
        <strong>
          {open.length > 0 ? `기간 안에 못 넣은 항목 ${open.length}개` : '못 넣은 항목을 모두 정리했어요'}
        </strong>
      </header>
      {open.length > 0 && (
        <p className="unplaced-tray-desc">
          남은 시간이 모자라 계획 기간 밖으로 넘기지 않았어요. 그대로 두면 날짜 미정으로 남아요 — 아래에서 바로 정할 수 있어요.
        </p>
      )}
      <ul className="unplaced-tray-list">
        {items.map((item) => (
          <li key={item.id} className={`unplaced-tray-item is-${item.status}`}>
            <div className="unplaced-tray-line">
              <span className="unplaced-tray-title">{item.title}</span>
              {item.minutes > 0 && <span className="unplaced-tray-meta">{minutesLabel(item.minutes)}</span>}
            </div>

            {item.status !== 'open' ? (
              <div className="unplaced-tray-resolved">
                <span>
                  {item.status === 'placed' && <><Clock3 size={12} /> {item.placedLabel}</>}
                  {item.status === 'deferred' && '날짜 미정으로 둬요'}
                  {item.status === 'excluded' && '이번 계획에서 뺐어요'}
                </span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => onUndo(item.id)}>
                  <RotateCcw size={12} /> 되돌리기
                </button>
              </div>
            ) : (
              <>
                <div className="unplaced-tray-actions">
                  {item.nextSlot && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => onPlace(item.id, item.nextSlot)}>
                      <ArrowRight size={12} /> {formatSlot(item.nextSlot.start, item.nextSlot.end)}에 넣기
                    </button>
                  )}
                  {item.fit && (
                    <button type="button" className="btn-ghost btn-sm"
                      onClick={() => onPlace(item.id, { ...slotOf(parts(item.fit.start).date, parts(item.fit.start).time, item.fit.minutes), minutes: item.fit.minutes })}>
                      <Minimize2 size={12} /> {minutesLabel(item.fit.minutes)}으로 줄여 {parts(item.fit.start).time}에 넣기
                    </button>
                  )}
                  <button type="button" className="btn-ghost btn-sm" aria-expanded={manualId === item.id}
                    onClick={() => (manualId === item.id ? setManualId(null) : startManual(item))}>
                    <CalendarClock size={12} /> 직접 정하기
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => onDefer(item.id)}>{deferLabel}</button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => onExclude(item.id)}>
                    <Ban size={12} /> 빼기
                  </button>
                </div>
                {manualId === item.id && (
                  <div className="unplaced-tray-manual">
                    <label><span>날짜</span>
                      <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
                    </label>
                    <label><span>시작</span>
                      <input type="time" value={manualTime} step="900" onChange={(e) => setManualTime(e.target.value)} />
                    </label>
                    <button type="button" className="btn-primary btn-sm" disabled={!manualDate || !manualTime}
                      onClick={() => submitManual(item)}>
                      {minutesLabel(item.minutes)} 놓기
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
