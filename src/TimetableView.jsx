import { useMemo, useState } from 'react';
import {
    CalendarDays,
    CalendarRange,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Plus,
    Pencil,
    Check,
    X,
    Clock,
    FileText,
    BookOpen,
    RefreshCw,
    Briefcase,
    CircleDot,
    PlusCircle,
    Info,
    ArrowLeft,
    MapPin,
    Tag,
    Code2,
    MoreHorizontal,
} from 'lucide-react';

/* ===================== 상수 ===================== */

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

const START_HOUR = 8;
const END_HOUR = 22;
const HOUR_PX = 46;

const CATEGORIES = [
    { key: 'study', label: '공부', color: '#6366f1' },
    { key: 'project', label: '프로젝트', color: '#22c55e' },
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
    project: CircleDot,
    code: Code2,
    study: BookOpen,
    work: Briefcase,
};

/* ===================== 목업 데이터 ===================== */

const EVENTS = [
    // 월 ~ 금 정보처리산업기사 특강
    ...[0, 1, 2, 3, 4].map((day) => ({
        id: `class-${day}`,
        day,
        title: '정보처리산업기사 특강',
        start: '09:00',
        end: '11:00',
        category: 'class',
        icon: 'class',
        repeat: '매주 월–금 09:00 – 11:00',
        place: '온라인 강의실',
        memo: '실기 대비 특강',
        nextRepeat: '7월 13일 월요일 09:00',
    })),
    // 운동 (월화수 + 금)
    ...[0, 1, 2, 4].map((day) => ({
        id: `routine-${day}`,
        day,
        title: '운동',
        start: '11:30',
        end: '12:30',
        category: 'routine',
        icon: 'routine',
        repeat: '매주 월·화·수·금 11:30 – 12:30',
        place: '헬스장',
        memo: '유산소 30분 + 근력',
        nextRepeat: '7월 13일 월요일 11:30',
    })),
    // diary-app 개발 (월수금)
    ...[0, 2, 4].map((day) => ({
        id: `project-${day}`,
        day,
        title: 'diary-app 개발',
        start: '14:00',
        end: '16:00',
        category: 'project',
        icon: 'project',
        repeat: '매주 월·수·금 14:00 – 16:00',
        place: '개인 작업실',
        memo: '기능 개발 및 개선, 배포 준비',
        nextRepeat: '7월 13일 월요일 14:00',
    })),
    // 자습 (화목)
    ...[1, 3].map((day) => ({
        id: `self-${day}`,
        day,
        title: '자습',
        start: '14:00',
        end: '15:00',
        category: 'study',
        icon: 'study',
    })),
    // 영어 공부 (월화목)
    ...[0, 1, 3].map((day) => ({
        id: `eng-${day}`,
        day,
        title: '영어 공부',
        start: '15:30',
        end: '17:00',
        category: 'study',
        icon: 'study',
    })),
    // LG Aimers (수금)
    ...[2, 4].map((day) => ({
        id: `aimers-${day}`,
        day,
        title: 'LG Aimers',
        start: '16:30',
        end: '18:00',
        category: 'study',
        icon: 'study',
    })),
    // 알바 (월~금)
    ...[0, 1, 2, 3, 4].map((day) => ({
        id: `work-${day}`,
        day,
        title: '알바',
        start: '19:00',
        end: '22:00',
        category: 'work',
        icon: 'work',
    })),
    // 토요일
    {
        id: 'sat-eng',
        day: 5,
        title: '영어 공부',
        start: '09:00',
        end: '10:30',
        category: 'study',
        icon: 'study',
    },
    {
        id: 'sat-self',
        day: 5,
        title: '자습',
        start: '11:00',
        end: '12:00',
        category: 'study',
        icon: 'study',
    },
];

const TODAY_EVENTS = [
    { id: 't1', title: '영어 공부', start: '09:00', end: '10:30', status: '종료', icon: 'study' },
    { id: 't2', title: '자습', start: '11:00', end: '12:00', status: '종료', icon: 'study' },
    { id: 't3', title: '알바', start: '19:00', end: '22:00', status: '예정', icon: 'work' },
];

/* ===================== 유틸 ===================== */

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

/* ===================== 컴포넌트 ===================== */

export default function TimetableView() {
    const [activeCategories, setActiveCategories] = useState(
        CATEGORIES.map((c) => c.key),
    );
    const [semesterOpen, setSemesterOpen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [, setMemoOpen] = useState(false);
    const [, setSlotOpen] = useState(false);

    const todayIndex = 5; // 토요일
    const nowMinutes = 19 * 60; // 19:00 현재 시각선

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

    const visibleEvents = EVENTS.filter((event) => {
        if (event.category === 'work') return true;
        return activeCategories.includes(event.category);
    });

    const dates = ['7/6', '7/7', '7/8', '7/9', '7/10', '7/11', '7/12'];

    return (
        <div className="timetable-view">
            {/* 최상단 헤더 바 (전체 폭) */}
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
                    {/* 툴바 */}
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
                            <span>7월 6일 – 7월 12일</span>
                        </div>

                        <div className="timetable-nav">
                            <button type="button" className="timetable-nav-btn">
                                <ChevronLeft size={15} />
                                이전
                            </button>
                            <button type="button" className="timetable-nav-btn">오늘</button>
                            <button type="button" className="timetable-nav-btn">
                                다음
                                <ChevronRight size={15} />
                            </button>
                        </div>
                    </div>

                    {/* 요약 바 */}
                    <div className="timetable-summary">
                        <span className="timetable-summary-main">오늘 남은 일정 1</span>
                        <span className="timetable-summary-dot">·</span>
                        <span className="timetable-summary-sub">시험 · 과제 3</span>
                    </div>

                    {/* 필터 */}
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

                    {/* 그리드 */}
                    <div className="timetable-grid-card">
                        <div className="timetable-grid">
                            {/* 헤더 행 */}
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
                        <span>
                          {day} {dates[index]}
                        </span>
                                            {isToday && <span className="timetable-today-badge">오늘</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 본문 */}
                            <div className="timetable-grid-body" style={{ height: gridHeight }}>
                                {/* 시간 눈금 */}
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

                                {/* 요일 컬럼 */}
                                {DAY_LABELS.map((day, dayIndex) => {
                                    const isToday = dayIndex === todayIndex;
                                    const dayEvents = visibleEvents.filter((e) => e.day === dayIndex);
                                    return (
                                        <div
                                            key={day}
                                            className={`timetable-col ${isToday ? 'today' : ''}`}
                                        >
                                            {/* 시간선 */}
                                            {hours.map((h) => (
                                                <div
                                                    key={h}
                                                    className="timetable-hline"
                                                    style={{ top: (h - START_HOUR) * HOUR_PX }}
                                                />
                                            ))}

                                            {/* 이벤트 */}
                                            {dayEvents.map((event) => {
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

                                            {/* 목요일 빈 슬롯 추가 버튼 */}
                                            {dayIndex === 3 && (
                                                <button
                                                    type="button"
                                                    className="timetable-add-slot"
                                                    style={{ top: topOf('11:30'), height: HOUR_PX - 8 }}
                                                >
                                                    <PlusCircle size={13} />
                                                    일정 추가
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* 현재 시각선 */}
                                <div
                                    className="timetable-nowline"
                                    style={{ top: ((nowMinutes - START_HOUR * 60) / 60) * HOUR_PX }}
                                >
                                    <span className="timetable-nowline-label">19:00</span>
                                    <span className="timetable-nowline-dot" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 하단 바 */}
                    <div className="timetable-footer">
                        <div className="timetable-footer-card">
                            <Clock size={16} className="timetable-footer-icon" />
                            <span className="timetable-footer-label">다음 빈 시간:</span>
                            <span className="timetable-footer-value">수요일 12:30 – 14:00</span>
                            <button
                                type="button"
                                className="timetable-footer-btn"
                                onClick={() => setSlotOpen((v) => !v)}
                            >
                                시간 후보 보기
                                <ChevronDown size={14} />
                            </button>
                        </div>

                        <div className="timetable-footer-card">
                            <FileText size={16} className="timetable-footer-icon" />
                            <span className="timetable-footer-label strong">시간표 메모</span>
                            <div className="timetable-memo-tags">
                                <span>마감 1</span>
                                <span className="timetable-memo-dot">·</span>
                                <span>주간 목표 2</span>
                                <span className="timetable-memo-dot">·</span>
                                <span>확인 필요 1</span>
                                <span className="timetable-memo-dot">·</span>
                                <span>개인 메모 1</span>
                            </div>
                            <button
                                type="button"
                                className="timetable-memo-toggle"
                                onClick={() => setMemoOpen((v) => !v)}
                            >
                                <ChevronDown size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 우측 패널 */}
                <aside className="timetable-side">
                    <div className="timetable-side-actions">
                        <button type="button" className="timetable-btn-primary">
                            <Plus size={16} />
                            일정 추가
                        </button>
                        <button type="button" className="timetable-btn-outline">
                            <Pencil size={15} />
                            시간표 편집
                        </button>
                    </div>

                    {panelOpen && (
                        selectedEvent ? (
                            /* ===== 선택 일정 상세 ===== */
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
                                    const DetailIcon =
                                        selectedEvent.category === 'project'
                                            ? Code2
                                            : ICON_MAP[selectedEvent.icon] || BookOpen;
                                    return (
                                        <>
                                            <div className="timetable-detail-name-row">
                                                <DetailIcon size={20} style={{ color: accent }} />
                                                <h2 className="timetable-detail-name">{selectedEvent.title}</h2>
                                                {cat && (
                                                    <span
                                                        className="timetable-detail-tag"
                                                        style={{
                                                            color: accent,
                                                            background: `${accent}14`,
                                                            borderColor: `${accent}44`,
                                                        }}
                                                    >
                                    {cat.label}
                                  </span>
                                                )}
                                            </div>

                                            <div className="timetable-detail-meta">
                                                <div className="timetable-detail-row">
                                                    <Clock size={16} />
                                                    <span className="timetable-detail-key">반복</span>
                                                    <span className="timetable-detail-val">
                                  {selectedEvent.repeat ||
                                      `${selectedEvent.start} – ${selectedEvent.end}`}
                                </span>
                                                </div>
                                                <div className="timetable-detail-row">
                                                    <MapPin size={16} />
                                                    <span className="timetable-detail-key">장소</span>
                                                    <span className="timetable-detail-val">
                                  {selectedEvent.place || '미지정'}
                                </span>
                                                </div>
                                                <div className="timetable-detail-row">
                                                    <Tag size={16} />
                                                    <span className="timetable-detail-key">메모</span>
                                                    <span className="timetable-detail-val">
                                  {selectedEvent.memo || '없음'}
                                </span>
                                                </div>
                                            </div>

                                            <div
                                                className="timetable-detail-note"
                                                style={{
                                                    background: `${accent}0d`,
                                                    borderColor: `${accent}33`,
                                                    color: accent,
                                                }}
                                            >
                                                <Info size={15} />
                                                <span>
                                이번 주 {DAY_LABELS[selectedEvent.day]}요일 일정입니다.
                              </span>
                                            </div>

                                            {selectedEvent.nextRepeat && (
                                                <div className="timetable-detail-next">
                                                    <CalendarDays size={16} />
                                                    <span className="timetable-detail-next-label">
                                    다음 반복 일정:
                                  </span>
                                                    <span className="timetable-detail-next-val">
                                    {selectedEvent.nextRepeat}
                                  </span>
                                                </div>
                                            )}

                                            <div className="timetable-detail-actions">
                                                <button type="button" className="timetable-detail-edit">
                                                    <Pencil size={15} />
                                                    수정
                                                </button>
                                                <button
                                                    type="button"
                                                    className="timetable-detail-more"
                                                    aria-label="더보기"
                                                >
                                                    <MoreHorizontal size={18} />
                                                </button>
                                            </div>

                                            <button type="button" className="timetable-detail-link">
                                                <CalendarDays size={15} />
                                                오늘 계획에서 보기
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                            /* ===== 오늘 일정 목록 ===== */
                            <div className="timetable-panel">
                                <div className="timetable-panel-head">
                                    <div>
                                        <h2 className="timetable-panel-title">오늘 일정</h2>
                                        <p className="timetable-panel-date">7월 11일 토요일</p>
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

                                <div className="timetable-panel-list">
                                    {TODAY_EVENTS.map((event) => {
                                        const EventIcon = ICON_MAP[event.icon] || BookOpen;
                                        const done = event.status === '종료';
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
                                                        {event.start} – {event.end}
                                                    </div>
                                                    <div className="timetable-panel-name">{event.title}</div>
                                                </div>
                                                <span
                                                    className={`timetable-status ${done ? 'done' : 'upcoming'}`}
                                                >
                                {event.status}
                              </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="timetable-panel-hint">
                                    <Info size={14} />
                                    <p>시간표에서 일정을 클릭하면 반복, 장소, 메모를 확인할 수 있어요.</p>
                                </div>
                            </div>
                        )
                    )}
                </aside>
            </div>
        </div>
    );
}