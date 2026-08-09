/**
 * 실행 탭.
 *
 * 책임: 사용자가 적용해 현재 활성화된 계획·시간표·루틴을
 *      여러 날짜 범위에서 운영한다.
 * 핵심 질문: 전체 진행·주간 배치·반복 운영에서 무엇을 조정해야 할까?
 *
 * 중요한 규칙(v6.1 §2):
 * 이 화면에서는 완료·일부 진행·진행 없음 같은 실제 결과를 직접 기록하지 않는다.
 * 조회와 운영 조정만 담당한다.
 *
 * 구조적 강제: ExecutionItemCard 에 onRecordResult 를 전달하지 않는다.
 * prop 이 없으면 결과 버튼 자체가 렌더링되지 않으므로,
 * 나중에 누가 실수로 기록 기능을 여기에 붙이려 해도 먼저 이 주석을 만나게 된다.
 * 오늘 항목의 결과를 남기려는 행동은 onGoToday 로 오늘 화면에 연결한다.
 */

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ViewHeader, SubTabs, ExecutionItemCard, EmptyState } from './shared.jsx';
import {
  selectActiveExecutionItems,
  groupByPlan,
  getTodayString,
  MOCK_PLAN_ITEMS,
  MOCK_PLANS,
} from '../mock/executionMock.js';
import { executionItemAPI } from '../api/api.js';
import TimetableView from '../TimetableView.jsx';

const SUB_TABS = [
  { key: 'progress', label: '진행 목록' },
  { key: 'timetable', label: '시간표' },
  { key: 'routine', label: '루틴' },
];

/** 월요일 시작 주간 날짜 7개. 로컬 기준으로만 계산해 UTC 밀림을 피한다. */
function weekDatesFor(offset) {
  const now = new Date();
  const day = now.getDay(); // 0=일 ... 6=토
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
}

export default function ExecutionView({ items, onOpenDetail, onGoToday }) {
  const [sub, setSub] = useState('progress');
  const today = getTodayString();

  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = weekDatesFor(weekOffset);
  const [timetableItems, setTimetableItems] = useState([]);
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [timetableError, setTimetableError] = useState(null);

  useEffect(() => {
    if (sub !== 'timetable') return;
    let cancelled = false;
    setTimetableLoading(true);
    setTimetableError(null);
    executionItemAPI.getByDateRange(weekDates[0], weekDates[6])
      .then((data) => { if (!cancelled) setTimetableItems(data); })
      .catch((err) => { if (!cancelled) setTimetableError(err.message || '시간표를 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setTimetableLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, weekOffset]);

  const active = selectActiveExecutionItems(items);
  const groups = groupByPlan(active, MOCK_PLAN_ITEMS, MOCK_PLANS);

  return (
    <div className="v6-view">
      <ViewHeader
        title="실행"
        question="전체 진행·주간 배치·반복 운영에서 무엇을 조정해야 할까?"
      />
      <SubTabs tabs={SUB_TABS} active={sub} onChange={setSub} />

      {sub === 'progress' && (
        <>
          <p className="v6-notice">
            여기서는 계획을 옮기고 다시 배치해요. 실제로 한 일을 남기는 건 오늘
            화면에서 합니다.
          </p>

          {groups.length === 0 ? (
            <EmptyState title="진행 중인 계획이 없어요" />
          ) : (
            groups.map((g, idx) => (
              <section className="v6-section" key={g.plan?.planId ?? `none-${idx}`}>
                <h2 className="v6-section-title">
                  {g.plan ? g.plan.title : '계획에 속하지 않은 조각'}
                </h2>
                <div className="v6-item-list">
                  {g.items.map((item) => {
                    const isToday = item.scheduledDate === today;
                    return (
                      <ExecutionItemCard
                        key={item.executionItemId}
                        item={item}
                        /* onRecordResult 를 의도적으로 전달하지 않는다. */
                        onOpenDetail={onOpenDetail}
                        footer={
                          isToday ? (
                            <div className="v6-item-footer">
                              <button
                                type="button"
                                className="v6-btn-link"
                                onClick={() => onGoToday?.(item)}
                              >
                                오늘에서 결과 남기기 <ArrowRight size={13} />
                              </button>
                            </div>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {/*
        * 시간표는 실행 탭의 내부 보기다(v6.1 §5.4).
        * Today와 같은 원본(executionItemAPI)을 주간 범위로 조회해 투영한다 — 별도의
        * "학습 시간표" mock을 따로 소유하지 않는다.
        */}
      {sub === 'timetable' && (
        <TimetableView
          items={timetableItems}
          weekDates={weekDates}
          todayDate={today}
          loading={timetableLoading}
          error={timetableError}
          onPrevWeek={() => setWeekOffset((v) => v - 1)}
          onNextWeek={() => setWeekOffset((v) => v + 1)}
          onToday={() => setWeekOffset(0)}
          onOpenDetail={onOpenDetail}
        />
      )}

      {sub === 'routine' && (
        <EmptyState
          title="루틴 운영은 다음 단계에서 연결해요"
          desc="반복 일정과 그날의 인스턴스를 함께 보는 화면이 들어갈 자리예요."
        />
      )}
    </div>
  );
}
