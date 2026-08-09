import { useMemo, useState } from 'react';
import {
    CalendarDays,
    CalendarRange,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Plus,
    Check,
    X,
    Clock,
    FileText,
    BookOpen,
    RefreshCw,
    Info,
    ArrowLeft,
} from 'lucide-react';
import { STATUS_LABEL, PRIORITY_LABEL } from './types/execution.js';

/*
 * v6.1 §12: 주간 시간표는 더 이상 자체 mock(EVENTS/TODAY_EVENTS)을 갖지 않는다.
 * items(ExecutionItemDto[])/weekDates/todayDate는 모두 부모(ExecutionView)가 executionItemAPI
 * 로 실제 조회해 내려준다 — Today 화면과 같은 원본, 같은 API를 쓴다. 여기서는 그 원본을
 * 주간 그리드로 투영만 한다.
 */

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

const START_HOUR = 8;
const END_HOUR = 22;
const HOUR_PX = 46;

const CATEGORIES = [
    { key: 'study', label: '공부', color: '#6366f1' },
    { key: 'class', label: '교정 일정', color: '#3b82f6' },
    { key: 'routine', label: '루틴', color: '#06b6d4' },
];

const CATEGORY_MAP = CATEGORIES.reduce((acc, c) => {
    acc[c.key] = c;
    return acc;
}, {});

const ICON_MAP = {
    class: CalendarDays,
    routine: RefreshCw,
    study: BookOpen,
};

/* ===================== 실행 조각 -> 화면 이벤트 매핑 ===================== */

/** ExecutionItemType -> 화면 카테고리. 백엔드에 없는 필드(장소/메모/반복 문구 등)는 만들지 않는다. */
function categoryOf(item) {
    if (item.itemType === 'FIXED_EVENT') return 'class';
    if (item.itemType === 'ROUTINE_OCCURRENCE') return 'routine';
    return 'study';
}

function toEvent(item) {
    return {
        id: item.executionItemId,
        raw: item,
        day: null, // weekDates 기준으로 호출부에서 채운다
        title: item.title,
        start: item.startTime,
        end: item.endTime,
        category: categoryOf(item),
        icon: categoryOf(item),
        status: item.status,
        priority: item.priority,
        estimatedMinutes: item.estimatedMinutes,
    };
}

/* ===================== 날짜 유틸 ===================== */

function toMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

function topOf(hhmm) {
    return ((toMinutes(hhmm) - START_HOUR * 60) / 60) * HOUR_PX;
}

function heightOf(start, end) {
    return ((toMinutes(end) - toMinutes(start)) / 60) * HOUR_PX;
}

function formatMD(dateString) {
    if (!dateString) return '';
    const [, m, d] = dateString.split('-');
    return `${Number(m)}/${Number(d)}`;
}

function formatMDKo(dateString) {
    if (!dateString) return '';
    const [, m, d] = dateString.split('-');
    return `${Number(m)}월 ${Number(d)}일`;
}

function formatFullKo(dateString) {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${formatMDKo(dateString)} ${days[date.getDay()]}요일`;
}

/* ===================== 컴포넌트 ===================== */

export default function TimetableView({
    items = [],
    weekDates = [],
    todayDate,
    loading = false,
    error = null,
    onPrevWeek,
    onNextWeek,
    onToday,
    onOpenDetail,
}) {
    const [activeCategories, setActiveCategories] = useState(CATEGORIES.map((c) => c.key));
    const [semesterOpen, setSemesterOpen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);

    const todayIndex = weekDates.indexOf(todayDate);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const hours = useMemo(() => {
        const list = [];
        for (let h = START_HOUR; h <= END_HOUR; h += 1) list.push(h);
        return list;
    }, []);

    const gridHeight = (END_HOUR - START_HOUR) * HOUR_PX;

    const toggleCategory = (key) => {
        setActiveCategories((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
        );
    };

    const events = useMemo(() => {
        return items
            .filter((item) => item.scheduledDate && weekDates.includes(item.scheduledDate))
            .map((item) => ({ ...toEvent(item), day: weekDates.indexOf(item.scheduledDate) }));
    }, [items, weekDates]);

    const visibleEvents = events.filter((event) => activeCategories.includes(event.category));
    const timedEvents = visibleEvents.filter((event) => event.start && event.end);
    const untimedEvents = visibleEvents.filter((event) => !event.start || !event.end);

    const todayEvents = events
        .filter((event) => event.day === todayIndex)
        .sort((a, b) => (a.start ?? '99:99').localeCompare(b.start ?? '99:99'));

    return (
        <div className="timetable-view">
            <div className="timetable-topbar">
                <h1 className="timetable-title">주간 시간표</h1>
                <div className="timetable-header-hint">
                    <span>무엇을 해볼까요?</span>
                    <button type="button" className="timetable-quick-btn">
                        <Plus size={11} />
                        오늘 조각
                    </button>
                </div>
            </div>

            <div className="timetable-body">
                <div className="timetable-main">
                    <div className="timetable-toolbar">
                        <div className="timetable-select-wrap">
                            <button
                                type="button"
                                className="timetable-select"
                                onClick={() => setSemesterOpen((v) => !v)}
                            >
                                <CalendarRange size={16} />
                                <span>2026 여름방학</span>
                                <ChevronDown size={16} className="timetable-select-caret" />
                            </button>
                            {semesterOpen && (
                                <div className="timetable-select-menu" role="menu">
                                    <button type="button" role="menuitem" className="active">
                                        2026 여름방학
                                    </button>
                                    <button type="button" role="menuitem">2026 1학기</button>
                                    <button type="button" role="menuitem">2025 2학기</button>
                                </div>
                            )}
                        </div>

                        <div className="timetable-range">
                            <CalendarDays size={16} />
                            <span>{formatMDKo(weekDates[0])} – {formatMDKo(weekDates[6])}</span>
                        </div>

                        <div className="timetable-nav">
                            <button type="button" className="timetable-nav-btn" onClick={onPrevWeek}>
                                <ChevronLeft size={15} />
                                이전
                            </button>
                            <button type="button" className="timetable-nav-btn" onClick={onToday}>오늘</button>
                            <button type="button" className="timetable-nav-btn" onClick={onNextWeek}>
                                다음
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>

                    <div className="timetable-summary">
                        <span className="timetable-summary-main">이번 주 실행 조각 {events.length}개</span>
                        {loading && (
                            <>
                                <span className="timetable-summary-dot">·</span>
                                <span className="timetable-summary-sub">불러오는 중...</span>
                            </>
                        )}
                        {error && (
                            <>
                                <span className="timetable-summary-dot">·</span>
                                <span className="timetable-summary-sub timetable-summary-error">{error}</span>
                            </>
                        )}
                    </div>

                    <div className="timetable-filter">
                        <span className="timetable-filter-label">표시 일정</span>
                        {CATEGORIES.map((cat) => {
                            const on = activeCategories.includes(cat.key);
                            return (
                                <button
                                    type="button"
                                    key={cat.key}
                                    className={`timetable-chip ${on ? 'on' : ''}`}
                                    style={
                                        on
                                            ? {
                                                color: cat.color,
                                                borderColor: `${cat.color}55`,
                                                background: `${cat.color}0f`,
                                            }
                                            : undefined
                                    }
                                    onClick={() => toggleCategory(cat.key)}
                                >
                                    <Check size={14} />
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="timetable-grid-card">
                        <div className="timetable-grid">
                            <div className="timetable-grid-head">
                                <div className="timetable-gutter-head" />
                                {DAY_LABELS.map((day, index) => {
                                    const isToday = index === todayIndex;
                                    const isSunday = index === 6;
                                    return (
                                        <div
                                            key={day}
                                            className={`timetable-day-head ${isToday ? 'today' : ''} ${
                                                isSunday ? 'sunday' : ''
                                            }`}
                                        >
                                            <span>{day} {formatMD(weekDates[index])}</span>
                                            {isToday && <span className="timetable-today-badge">오늘</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="timetable-grid-body" style={{ height: gridHeight }}>
                                <div className="timetable-gutter">
                                    {hours.map((h) => (
                                        <div
                                            key={h}
                                            className="timetable-gutter-cell"
                                            style={{ top: (h - START_HOUR) * HOUR_PX }}
                                        >
                                            {String(h).padStart(2, '0')}:00
                                        </div>
                                    ))}
                                </div>

                                {DAY_LABELS.map((day, dayIndex) => {
                                    const isToday = dayIndex === todayIndex;
                                    const dayTimedEvents = timedEvents.filter((e) => e.day === dayIndex);
                                    const dayUntimedEvents = untimedEvents.filter((e) => e.day === dayIndex);
                                    return (
                                        <div
                                            key={day}
                                            className={`timetable-col ${isToday ? 'today' : ''}`}
                                        >
                                            {dayUntimedEvents.length > 0 && (
                                                <div className="timetable-untimed-row">
                                                    {dayUntimedEvents.map((event) => {
                                                        const cat = CATEGORY_MAP[event.category];
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={event.id}
                                                                className="timetable-untimed-chip"
                                                                style={{ color: cat?.color, borderColor: `${cat?.color}55` }}
                                                                onClick={() => { setSelectedEvent(event); setPanelOpen(true); }}
                                                            >
                                                                {event.title}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {hours.map((h) => (
                                                <div
                                                    key={h}
                                                    className="timetable-hline"
                                                    style={{ top: (h - START_HOUR) * HOUR_PX }}
                                                />
                                            ))}

                                            {dayTimedEvents.map((event) => {
                                                const cat = CATEGORY_MAP[event.category];
                                                const accent = cat ? cat.color : '#9ca3af';
                                                const EventIcon = ICON_MAP[event.icon] || BookOpen;
                                                const isSelected = selectedEvent?.id === event.id;
                                                return (
                                                    <div
                                                        key={event.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        className={`timetable-event ${isSelected ? 'selected' : ''}`}
                                                        style={{
                                                            top: topOf(event.start),
                                                            height: heightOf(event.start, event.end) - 6,
                                                            borderLeftColor: accent,
                                                            background: cat ? `${accent}0d` : '#f9fafb',
                                                            ...(isSelected ? { outlineColor: accent } : null),
                                                        }}
                                                        onClick={() => {
                                                            setSelectedEvent(event);
                                                            setPanelOpen(true);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                setSelectedEvent(event);
                                                                setPanelOpen(true);
                                                            }
                                                        }}
                                                    >
                                                        <div className="timetable-event-title">
                                                            <EventIcon size={12} style={{ color: accent }} />
                                                            <span>{event.title}</span>
                                                        </div>
                                                        <div className="timetable-event-time">
                                                            {event.start} – {event.end}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}

                                {todayIndex !== -1 && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
                                    <div
                                        className="timetable-nowline"
                                        style={{ top: ((nowMinutes - START_HOUR * 60) / 60) * HOUR_PX }}
                                    >
                                        <span className="timetable-nowline-label">
                                            {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
                                        </span>
                                        <span className="timetable-nowline-dot" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="timetable-side">
                    {panelOpen && (
                        selectedEvent ? (
                            <div className="timetable-panel">
                                <div className="timetable-detail-head">
                                    <button
                                        type="button"
                                        className="timetable-detail-back"
                                        onClick={() => setSelectedEvent(null)}
                                    >
                                        <ArrowLeft size={15} />
                                        오늘 일정
                                    </button>
                                    <span className="timetable-detail-title">선택 일정</span>
                                    <button
                                        type="button"
                                        className="timetable-panel-close"
                                        onClick={() => {
                                            setSelectedEvent(null);
                                            setPanelOpen(false);
                                        }}
                                        aria-label="패널 닫기"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {(() => {
                                    const cat = CATEGORY_MAP[selectedEvent.category];
                                    const accent = cat ? cat.color : '#9ca3af';
                                    const DetailIcon = ICON_MAP[selectedEvent.icon] || BookOpen;
                                    return (
                                        <>
                                            <div className="timetable-detail-name-row">
                                                <DetailIcon size={20} style={{ color: accent }} />
                                                <h2 className="timetable-detail-name">{selectedEvent.title}</h2>
                                                {cat && (
                                                    <span
                                                        className="timetable-detail-tag"
                                                        style={{ color: accent, background: `${accent}14`, borderColor: `${accent}44` }}
                                                    >
                                                        {cat.label}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="timetable-detail-meta">
                                                <div className="timetable-detail-row">
                                                    <Clock size={16} />
                                                    <span className="timetable-detail-key">시간</span>
                                                    <span className="timetable-detail-val">
                                                        {selectedEvent.start ? `${selectedEvent.start} – ${selectedEvent.end}` : '시간 미정'}
                                                    </span>
                                                </div>
                                                <div className="timetable-detail-row">
                                                    <Info size={16} />
                                                    <span className="timetable-detail-key">상태</span>
                                                    <span className="timetable-detail-val">
                                                        {STATUS_LABEL[selectedEvent.status] ?? selectedEvent.status}
                                                    </span>
                                                </div>
                                                <div className="timetable-detail-row">
                                                    <FileText size={16} />
                                                    <span className="timetable-detail-key">우선순위</span>
                                                    <span className="timetable-detail-val">
                                                        {PRIORITY_LABEL[selectedEvent.priority] ?? selectedEvent.priority}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className="timetable-detail-link"
                                                onClick={() => onOpenDetail?.(selectedEvent.raw)}
                                            >
                                                <CalendarDays size={15} />
                                                오늘 계획에서 보기
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div className="timetable-panel">
                                <div className="timetable-panel-head">
                                    <div>
                                        <h2 className="timetable-panel-title">오늘 일정</h2>
                                        <p className="timetable-panel-date">{formatFullKo(todayDate)}</p>
                                    </div>
                                    <button
                                        type="button"
                                        className="timetable-panel-close"
                                        onClick={() => setPanelOpen(false)}
                                        aria-label="패널 닫기"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {todayEvents.length === 0 ? (
                                    <p className="timetable-panel-hint">오늘 배치된 실행 조각이 없어요.</p>
                                ) : (
                                    <div className="timetable-panel-list">
                                        {todayEvents.map((event) => {
                                            const EventIcon = ICON_MAP[event.icon] || BookOpen;
                                            const done = event.status === 'DONE';
                                            return (
                                                <div
                                                    key={event.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    className="timetable-panel-item"
                                                    onClick={() => setSelectedEvent(event)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            setSelectedEvent(event);
                                                        }
                                                    }}
                                                >
                                                    <div className="timetable-panel-icon">
                                                        <EventIcon size={16} />
                                                    </div>
                                                    <div className="timetable-panel-body">
                                                        <div className="timetable-panel-time">
                                                            {event.start ? `${event.start} – ${event.end}` : '시간 미정'}
                                                        </div>
                                                        <div className="timetable-panel-name">{event.title}</div>
                                                    </div>
                                                    <span className={`timetable-status ${done ? 'done' : 'upcoming'}`}>
                                                        {STATUS_LABEL[event.status] ?? event.status}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="timetable-panel-hint">
                                    <Info size={14} />
                                    <p>시간표에서 일정을 클릭하면 상태와 우선순위를 확인할 수 있어요.</p>
                                </div>
                            </div>
                        )
                    )}
                </aside>
            </div>
        </div>
    );
}
