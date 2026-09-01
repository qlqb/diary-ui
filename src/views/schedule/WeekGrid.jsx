/**
 * 주간 시간 격자.
 *
 * 실제 실행 조각과 AI 초안을 같은 격자 위에 함께 그린다 — 초안이 "적용되면 내 일주일이
 * 이렇게 바뀐다"를 카드 설명이 아니라 실제 자리로 보여주기 위해서다.
 *
 * 초안 블록은 점선 테두리와 반투명으로 실제 항목과 구분되고, 끌어서 요일·시각을 바꿀 수 있다.
 * 끌어놓는 순간에도 서버는 전혀 바뀌지 않는다 — 초안 상태만 바뀌고, 반영은 적용 버튼에서만 한다.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { formatDateShort, hhmmOf, minutesOf, toHHmm, weekdayKo } from '../../lib/datetime.js';

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_PX = 40;
const SNAP_MINUTES = 15;
const GRID_HEIGHT = (END_HOUR - START_HOUR) * HOUR_PX;

function topOf(hhmm) {
  return ((minutesOf(hhmm) - START_HOUR * 60) / 60) * HOUR_PX;
}

function heightOf(startHHmm, endHHmm) {
  const h = ((minutesOf(endHHmm) - minutesOf(startHHmm)) / 60) * HOUR_PX;
  return Math.max(18, h);
}

/**
 * 반복 일정 발생분 하나를 격자에 그릴 조각들로 나눈다.
 *
 * 발생분은 자정을 넘을 수 있어서(알바 22:00~02:00, CL 15:00~00:00) 하루 칸 하나에 담기지
 * 않는다. 시작한 날의 조각과 다음 날의 조각으로 나눈다.
 *
 * 격자가 06시부터라 그 앞은 그리지 못한다. 22:00~02:00의 새벽 조각처럼 06시 이전에 끝나는
 * 부분은 여기서 빠진다 — 없는 척하는 것이 아니라, 아래 반복 일정 목록이 전체 구간을
 * 그대로 보여준다. 배치는 잘라내지 않은 원래 구간을 본다.
 */
function occurrenceSegments(occurrence) {
  const startDate = occurrence.startAt.slice(0, 10);
  const endDate = occurrence.endAt.slice(0, 10);
  const startTime = toHHmm(occurrence.startAt);
  const endTime = toHHmm(occurrence.endAt);
  if (startDate === endDate) {
    return [{ date: startDate, startTime, endTime }];
  }
  const segments = [{ date: startDate, startTime, endTime: '24:00' }];
  if (endTime !== '00:00') {
    segments.push({ date: endDate, startTime: '00:00', endTime });
  }
  return segments;
}

/**
 * 같은 날 겹치는 발생분을 나란히 놓는다.
 *
 * 필요한 이유는 보강 때문이다. 보강이 정규 수업이 있는 날로 옮겨 오면 그날 같은 시각에
 * 발생분이 둘이 되고(둘 다 실제로 가야 한다), 폭이 같으면 뒤에 그린 것이 앞의 것을 통째로
 * 덮어 하나만 있는 것처럼 보인다. 대부분의 날은 하나뿐이라 폭이 그대로다.
 */
function assignLanes(entries) {
  const sorted = [...entries].sort(
    (a, b) => minutesOf(a.segment.startTime) - minutesOf(b.segment.startTime),
  );
  const laneEnds = [];
  const placed = sorted.map((entry) => {
    const start = minutesOf(entry.segment.startTime);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = minutesOf(entry.segment.endTime);
    return { ...entry, lane };
  });
  const laneCount = Math.max(1, laneEnds.length);
  return placed.map((entry) => ({ ...entry, laneCount }));
}

function clampSegment(segment) {
  const start = Math.max(minutesOf(segment.startTime), START_HOUR * 60);
  const end = Math.min(minutesOf(segment.endTime), END_HOUR * 60);
  if (end <= start) return null;
  return { ...segment, startTime: hhmmOf(start), endTime: end === END_HOUR * 60 ? '24:00' : hhmmOf(end) };
}

export default function WeekGrid({
  dates, items, draftCards, occurrences, commitments, todayDate,
  onPatchCard, onSelectItem, onSelectCommitment,
}) {
  const gridRef = useRef(null);
  /*
   * 끌기 상태는 ref에 둔다. state로 두면 pointerdown의 setState가 반영되기 전에 pointerup이
   * 도착하는 경우(빠른 클릭, 합성 이벤트) 이전 렌더의 클로저가 null을 보고 이동을 통째로
   * 무시한다. 화면 표시용 클래스만 별도 state로 관리한다.
   */
  const dragRef = useRef(null); // { proposalItemId, offsetY }
  const [draggingId, setDraggingId] = useState(null);

  /*
   * 격자는 06시부터 24시까지라 세로로 길다. 1536x760에서는 절반 정도만 보이므로, 실제로
   * 무언가 있는 가장 이른 시각이 화면에 들어오도록 처음에 스크롤을 맞춘다 — 초안이 저녁에
   * 배치됐는데 화면에는 빈 오전만 보이는 상태를 만들지 않는다.
   */
  const earliestTop = (() => {
    const starts = [
      ...items.filter((i) => i.startTime).map((i) => i.startTime),
      ...draftCards.filter((c) => !c.excluded && c.startTime).map((c) => c.startTime),
    ];
    if (starts.length === 0) return null;
    return topOf(starts.sort()[0]);
  })();

  const weekStart = dates[0];
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    // 아무것도 없으면 아침(08시)을 기준으로 둔다.
    const target = earliestTop ?? topOf('08:00');
    grid.scrollTop = Math.max(0, Math.min(grid.scrollHeight - grid.clientHeight, target - HOUR_PX));
  }, [earliestTop, weekStart]);

  const timedByDate = {};
  const untimedByDate = {};
  const routineByDate = {};
  const commitmentByDate = {};
  for (const date of dates) {
    timedByDate[date] = [];
    untimedByDate[date] = [];
    routineByDate[date] = [];
    commitmentByDate[date] = [];
  }
  for (const occurrence of occurrences ?? []) {
    for (const segment of occurrenceSegments(occurrence)) {
      if (!(segment.date in routineByDate)) continue;
      const clamped = clampSegment(segment);
      if (clamped) routineByDate[segment.date].push({ occurrence, segment: clamped });
    }
  }
  for (const date of dates) {
    routineByDate[date] = assignLanes(routineByDate[date]);
  }
  /*
   * 약속도 같은 조각내기를 쓴다 — 자정을 넘기면 두 날에 걸쳐 그려야 하는 것이 똑같다.
   * 다른 것은 클릭이 열린다는 점뿐이다(반복 일정은 행이 없어 열 상세가 없다).
   */
  for (const commitment of commitments ?? []) {
    for (const segment of occurrenceSegments(commitment)) {
      if (!(segment.date in commitmentByDate)) continue;
      const clamped = clampSegment(segment);
      if (clamped) commitmentByDate[segment.date].push({ commitment, segment: clamped });
    }
  }
  for (const item of items) {
    if (!item.scheduledDate || !(item.scheduledDate in timedByDate)) continue;
    if (item.startTime && item.endTime) timedByDate[item.scheduledDate].push(item);
    else untimedByDate[item.scheduledDate].push(item);
  }

  /**
   * 끌어놓기. 격자 좌표 -> (요일, 시각). 15분 단위로 스냅한다.
   * 초안 카드만 움직인다 — 확정된 실행 조각은 끌어서 옮기지 않는다(그건 항목 줄의 "미루기"가
   * 이벤트 기록과 함께 처리한다).
   */
  const handlePointerMoveEnd = (event, card) => {
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const relX = event.clientX - rect.left;
    const relY = event.clientY - rect.top + grid.scrollTop - (dragRef.current?.offsetY ?? 0);

    const columnWidth = rect.width / dates.length;
    const dayIndex = Math.max(0, Math.min(dates.length - 1, Math.floor(relX / columnWidth)));

    const rawMinutes = START_HOUR * 60 + (relY / HOUR_PX) * 60;
    const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    const duration = card.startTime && card.endTime
      ? minutesOf(card.endTime) - minutesOf(card.startTime)
      : (card.expectedMinutes || 30);
    const start = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - duration, snapped));

    onPatchCard(card.proposalItemId, {
      scheduledDate: dates[dayIndex],
      startTime: hhmmOf(start),
      endTime: hhmmOf(start + duration),
      autoPlaced: false,
      placementType: 'TIME_FIXED',
    });
  };

  return (
    <div className="week-grid-wrap">
      <div className="week-grid-head">
        <div className="week-grid-gutter" />
        {dates.map((date) => (
          <div key={date} className={`week-grid-day${date === todayDate ? ' is-today' : ''}`}>
            <span className="week-grid-dow">{weekdayKo(date)}</span>
            <span className="week-grid-date">{formatDateShort(date)}</span>
          </div>
        ))}
      </div>

      <div className="week-grid-allday">
        <div className="week-grid-gutter">시각 미정</div>
        {dates.map((date) => (
          <div key={date} className="week-grid-allday-cell">
            {untimedByDate[date].map((item) => (
              <button key={item.executionItemId} type="button" className="allday-chip"
                onClick={() => onSelectItem?.(item)} title={item.title}>
                {item.title}
              </button>
            ))}
            {draftCards
              .filter((c) => c.operation === 'CREATE' && c.scheduledDate === date && !c.startTime)
              .map((card) => (
                <span key={card.proposalItemId} className="allday-chip is-draft" title={card.title}>
                  <Sparkles size={11} /> {card.title}
                </span>
              ))}
          </div>
        ))}
      </div>

      <div className="week-grid-body" ref={gridRef}>
        <div className="week-grid-gutter" style={{ height: GRID_HEIGHT }}>
          {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
            <div key={i} className="week-grid-hour-label" style={{ top: i * HOUR_PX }}>
              {String(START_HOUR + i).padStart(2, '0')}
            </div>
          ))}
        </div>

        {dates.map((date) => (
          <div key={date} className={`week-grid-col${date === todayDate ? ' is-today' : ''}`} style={{ height: GRID_HEIGHT }}>
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <div key={i} className="week-grid-line" style={{ top: i * HOUR_PX }} />
            ))}

            {/*
              반복 일정은 실행 조각과 형태로 구분한다 — 행이 없는 값이라 클릭할 상세도 없고,
              끌어 옮길 수도 없다. 색만으로 나누지 않는 것은 이 화면 전체의 규칙이다.
            */}
            {routineByDate[date].map(({ occurrence, segment, lane, laneCount }, index) => (
              <div
                key={`ro-${occurrence.routineId}-${occurrence.sourceDate}-${index}`}
                className="grid-block is-routine"
                title={`${occurrence.title}${occurrence.location ? ` · ${occurrence.location}` : ''}`}
                style={{
                  top: topOf(segment.startTime),
                  height: heightOf(segment.startTime, segment.endTime),
                  left: `calc(3px + ${lane} * (100% - 6px) / ${laneCount})`,
                  width: `calc((100% - 6px) / ${laneCount})`,
                  right: 'auto',
                }}
              >
                <span className="grid-block-time">
                  {segment.startTime}
                  {occurrence.moved && <span className="grid-block-badge">보강</span>}
                </span>
                <span className="grid-block-title">{occurrence.title}</span>
              </div>
            ))}

            {/*
              약속은 반복 일정과 같은 회색 계열이지만 클릭이 열린다 — 고칠 수 있는 행이
              실제로 있기 때문이다. 라벨로 종류를 말하는 규칙은 같다.
            */}
            {commitmentByDate[date].map(({ commitment, segment }, index) => (
              <button
                key={`cm-${commitment.commitmentId}-${index}`}
                type="button"
                className="grid-block is-commitment"
                title={`${commitment.title}${commitment.locationText ? ` · ${commitment.locationText}` : ''}`}
                style={{
                  top: topOf(segment.startTime),
                  height: heightOf(segment.startTime, segment.endTime),
                }}
                onClick={() => onSelectCommitment?.(commitment)}
              >
                <span className="grid-block-time">
                  {segment.startTime}
                  <span className="grid-block-badge">약속</span>
                </span>
                <span className="grid-block-title">{commitment.title}</span>
              </button>
            ))}

            {timedByDate[date].map((item) => (
              <button
                key={item.executionItemId}
                type="button"
                className={`grid-block status-${(item.status ?? 'PLANNED').toLowerCase()}`}
                style={{ top: topOf(item.startTime), height: heightOf(item.startTime, item.endTime) }}
                onClick={() => onSelectItem?.(item)}
              >
                <span className="grid-block-time">{item.startTime}</span>
                <span className="grid-block-title">{item.title}</span>
              </button>
            ))}

            {draftCards
              .filter((c) => c.operation === 'CREATE' && c.scheduledDate === date && c.startTime && c.endTime)
              .map((card) => (
                <div
                  key={card.proposalItemId}
                  className={`grid-block is-draft${card.excluded ? ' is-excluded' : ''}${draggingId === card.proposalItemId ? ' is-dragging' : ''}`}
                  style={{ top: topOf(card.startTime), height: heightOf(card.startTime, card.endTime) }}
                  role="button"
                  tabIndex={0}
                  title={`${card.title} — 끌어서 옮길 수 있어요`}
                  onPointerDown={(e) => {
                    if (card.excluded) return;
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    const blockRect = e.currentTarget.getBoundingClientRect();
                    dragRef.current = { proposalItemId: card.proposalItemId, offsetY: e.clientY - blockRect.top };
                    setDraggingId(card.proposalItemId);
                  }}
                  onPointerUp={(e) => {
                    if (dragRef.current?.proposalItemId !== card.proposalItemId) return;
                    handlePointerMoveEnd(e, card);
                    dragRef.current = null;
                    setDraggingId(null);
                  }}
                >
                  <span className="grid-block-time"><Sparkles size={10} /> {card.startTime}</span>
                  <span className="grid-block-title">{card.title}</span>
                </div>
              ))}

            {/* 옮기자는 제안: 원래 자리는 흐리게, 새 자리는 초안으로 */}
            {draftCards
              .filter((c) => c.operation === 'MOVE' && c.scheduledDate === date && !c.excluded)
              .map((card) => (
                <div key={`mv-${card.proposalItemId}`} className="grid-block is-draft is-move"
                  style={{ top: 4, height: 34 }}>
                  <span className="grid-block-title"><Sparkles size={10} /> {card.title} (여기로 옮기기)</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
