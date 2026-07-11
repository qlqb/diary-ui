import { useEffect, useState } from 'react';
import './App.css';

import {
  Sparkles,
  CalendarCheck2,
  NotebookPen,
  LayoutGrid,
  BookOpen,
  Repeat,
  History,
  ClipboardList,
  BarChart3,
  Settings,
  LogOut,
  CalendarDays,
  MoreVertical,
  X,
  FolderOpen,
  Moon,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Equal,
  Timer,
  RotateCcw,
  PauseCircle,
} from 'lucide-react';

import { authAPI, diaryAPI, scheduleBlockAPI } from './api/api';
import DiaryListView from './DiaryListView';
import DiaryEditorView from './DiaryEditorView';
import StatisticsView from './StatisticsView';

/*
 * 시간표 도메인 API가 생기기 전까지 쓰는 목업 데이터.
 * "학기 중 무너진 계획을 오늘의 작은 조각으로 다시 연결한다"는 포지션상
 * 시간표·과목 컨텍스트는 오늘 화면에서 계속 보여주는 편이 맞다고 판단해
 * 빈 상태 대신 mock으로 채워둔다.
 */
const MOCK_TODAY_TIMETABLE = [
  { time: '09:00', title: '자료구조와 알고리즘', place: '301호', color: 'indigo' },
  { time: '11:00', title: '선형대수학', place: '204호', color: 'green' },
  { time: '13:00', title: '점심시간', place: '', color: 'gray' },
  { time: '14:00', title: '데이터베이스', place: '302호', color: 'amber' },
  { time: '16:00', title: '운영체제', place: '201호', color: 'rose' },
];

/*
 * 조각 추가 모달에서 쓰는 예상 시간/영역 저장 컬럼은 아직 없다
 * (estimated_minutes, category 미존재) — 화면만 우선 잡아둔 상태.
 * scope(WEEK/MONTH/PERIOD/YEAR/LATER)도 저장처 미정이라 선택만 되고
 * 실제로는 TODAY로 저장된다. 옵션 정의는 TodayExecutionView 내부에 있다.
 */

function App() {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('login');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initApp = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await authAPI.getCurrentUser();
        setUser(userData);
        setCurrentView('main');
      } catch {
        localStorage.removeItem('token');
        setUser(null);
        setCurrentView('login');
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  const handleLogin = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      if (response.token) localStorage.setItem('token', response.token);
      setUser(response.user);
      setCurrentView('main');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || '로그인에 실패했습니다.' };
    }
  };

  const handleSignup = async (email, password, nickname) => {
    try {
      const response = await authAPI.signup(email, password, nickname);
      if (response.token) localStorage.setItem('token', response.token);
      setUser(response.user);
      setCurrentView('main');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || '회원가입에 실패했습니다.' };
    }
  };

  const handleLogout = () => {
    authAPI.logout();
    setUser(null);
    setCurrentView('login');
  };

  if (loading) return <div className="loading">불러오는 중...</div>;

  return (
      <div className="app">
        {currentView === 'login' && (
            <AuthView mode="login" onAuth={handleLogin} onSwitch={() => setCurrentView('signup')} />
        )}
        {currentView === 'signup' && (
            <AuthView mode="signup" onAuth={handleSignup} onSwitch={() => setCurrentView('login')} />
        )}
        {currentView === 'main' && user && (
            <MainShell user={user} onLogout={handleLogout} />
        )}
      </div>
  );
}

function AuthView({ mode, onAuth, onSwitch }) {
  const [form, setForm] = useState({ email: '', password: '', nickname: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isLogin = mode === 'login';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const result = isLogin
        ? await onAuth(form.email.trim(), form.password)
        : await onAuth(form.email.trim(), form.password, form.nickname.trim());

    if (!result.success) setError(result.error);
    setLoading(false);
  };

  return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon"><Sparkles size={18} /></div>
            <h1>diary-app</h1>
          </div>
          <p className="subtitle">매일의 시간을 기록해보세요</p>

          <div className="auth-tabs">
            <button
                type="button"
                className={`auth-tab ${isLogin ? 'active' : ''}`}
                onClick={() => { if (!isLogin) onSwitch(); }}
            >
              로그인
            </button>
            <button
                type="button"
                className={`auth-tab ${!isLogin ? 'active' : ''}`}
                onClick={() => { if (isLogin) onSwitch(); }}
            >
              회원가입
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {!isLogin && (
                <div className="input-wrap">
                  <span className="input-icon">👤</span>
                  <input
                      className="input"
                      type="text"
                      placeholder="닉네임"
                      value={form.nickname}
                      onChange={(event) => setForm({ ...form, nickname: event.target.value })}
                      required
                  />
                </div>
            )}
            <div className="input-wrap">
              <span className="input-icon">✉️</span>
              <input
                  className="input"
                  type="email"
                  placeholder="이메일"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
              />
            </div>
            <div className="input-wrap">
              <span className="input-icon">🔒</span>
              <input
                  className="input"
                  type="password"
                  placeholder={isLogin ? '비밀번호' : '비밀번호 (최소 4자)'}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  minLength={isLogin ? undefined : 4}
                  required
              />
            </div>

            {error && <div className="error-message">⚠️ {error}</div>}

            <button type="submit" className="btn-primary" style={{ padding: '10px', marginTop: 2 }} disabled={loading}>
              {loading ? (isLogin ? '로그인 중...' : '가입 중...') : (isLogin ? '로그인' : '회원가입')}
            </button>
          </form>

          <button type="button" className="link-button" onClick={onSwitch}>
            {isLogin ? '계정이 없으신가요? 회원가입하기' : '이미 계정이 있으신가요? 로그인하기'}
          </button>
        </div>
      </div>
  );
}

/* ===================== 사이드바 셸 ===================== */

function MainShell({ user, onLogout }) {
  const [currentMenu, setCurrentMenu] = useState('today');

  const menuItems = [
    { key: 'today', label: '오늘', icon: CalendarCheck2 },
    { key: 'overview', label: '한눈에', icon: LayoutGrid },
    { key: 'timetable', label: '시간표', icon: CalendarDays },
    { key: 'subjects', label: '과목', icon: BookOpen },
    { key: 'plan', label: '공부계획', icon: ClipboardList },
    { key: 'routine', label: '루틴', icon: Repeat },
    { key: 'diary', label: '기록', icon: NotebookPen },
    { key: 'review', label: '돌아보기', icon: History },
    { key: 'statistics', label: '통계', icon: BarChart3 },
  ];

  const nickname = user?.nickname || user?.name || user?.email?.split('@')[0] || '사용자';

  return (
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon"><Sparkles size={20} /></div>
            <span>diary-app</span>
          </div>

          <nav className="sidebar-menu">
            {menuItems.map((menuItem) => {
              const MenuIcon = menuItem.icon;
              return (
                  <button
                      type="button"
                      key={menuItem.key}
                      className={`sidebar-item ${currentMenu === menuItem.key ? 'active' : ''}`}
                      onClick={() => setCurrentMenu(menuItem.key)}
                  >
                    <MenuIcon size={17} />
                    <span>{menuItem.label}</span>
                  </button>
              );
            })}
          </nav>

          <div className="sidebar-bottom">
            <div className="sidebar-user">
              <div className="sidebar-avatar">{nickname[0].toUpperCase()}</div>
              <span>{nickname}님</span>
            </div>
            <button
                type="button"
                className={`sidebar-item ${currentMenu === 'settings' ? 'active' : ''}`}
                onClick={() => setCurrentMenu('settings')}
            >
              <Settings size={17} />
              <span>설정</span>
            </button>
            <button type="button" className="sidebar-item" onClick={onLogout}>
              <LogOut size={17} />
              <span>로그아웃</span>
            </button>
          </div>
        </aside>

        <main className="shell-content">
          {currentMenu === 'today' && <TodayView />}
          {currentMenu === 'overview' && <OverviewView onGoToday={() => setCurrentMenu('today')} />}
          {currentMenu === 'diary' && <DiarySection />}
          {currentMenu === 'statistics' && <StatisticsView />}
          {currentMenu === 'timetable' && (
              <PlaceholderView
                  icon={<CalendarDays size={30} />}
                  title="시간표"
                  desc="정규 수업 시간을 등록하고 오늘 화면과 연결할 공간이에요. 아직 준비 중입니다."
              />
          )}
          {currentMenu === 'subjects' && (
              <PlaceholderView
                  icon={<BookOpen size={30} />}
                  title="과목"
                  desc="과목별 진도와 자료를 관리할 공간이에요. 아직 준비 중입니다."
              />
          )}
          {currentMenu === 'plan' && (
              <PlaceholderView
                  icon={<ClipboardList size={30} />}
                  title="공부계획"
                  desc="이번 주·이번 달의 큰 방향을 담을 공간이에요. 아직 준비 중입니다."
              />
          )}
          {currentMenu === 'routine' && (
              <PlaceholderView
                  icon={<Repeat size={30} />}
                  title="루틴"
                  desc="반복되는 습관을 가볍게 확인할 공간이에요. 아직 준비 중입니다."
              />
          )}
          {currentMenu === 'review' && (
              <PlaceholderView
                  icon={<History size={30} />}
                  title="돌아보기"
                  desc="한 주의 완료/이동/축소/보류 흐름을 돌아보는 공간이에요. 아직 준비 중입니다."
              />
          )}
          {currentMenu === 'settings' && (
              <PlaceholderView
                  icon={<Settings size={30} />}
                  title="설정"
                  desc="알림, 기본 보기 방식 등을 관리할 공간이에요. 아직 준비 중입니다."
              />
          )}
        </main>
      </div>
  );
}

function PlaceholderView({ icon, title, desc }) {
  return (
      <div className="placeholder-view">
        <div className="placeholder-icon">{icon}</div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
  );
}

/* ===================== 기록 (일기) ===================== */

function DiarySection() {
  const [mode, setMode] = useState('list');
  const [diaries, setDiaries] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filter, setFilter] = useState({});
  const [editingDiary, setEditingDiary] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDiaries = async (page = 1) => {
    setLoading(true);
    try {
      const response = await diaryAPI.getDiaries(page, 10, filter);
      setDiaries(response.content ?? []);
      setCurrentPage(response.page ?? page);
      setTotalPages(response.totalPages ?? 0);
    } catch (error) {
      alert('일기 목록을 불러오는 데 실패했습니다: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchKeyword.trim()) {
      loadDiaries(1);
      return;
    }

    setLoading(true);
    try {
      const response = await diaryAPI.searchDiaries(searchKeyword, 1, 10);
      setDiaries(response.content || []);
      setCurrentPage(response.page || 1);
      setTotalPages(response.totalPages || 0);
    } catch (error) {
      alert('검색에 실패했습니다: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDiarySaved = () => {
    setMode('list');
    setEditingDiary(null);
    loadDiaries(currentPage);
  };

  const handleDelete = async (diaryId) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await diaryAPI.deleteDiary(diaryId);
      loadDiaries(currentPage);
    } catch (error) {
      alert('삭제에 실패했습니다: ' + error.message);
    }
  };

  const handleToggleFavorite = async (diaryId) => {
    try {
      await diaryAPI.toggleFavorite(diaryId);
      loadDiaries(currentPage);
    } catch (error) {
      alert('즐겨찾기 변경에 실패했습니다: ' + error.message);
    }
  };

  useEffect(() => {
    if (mode === 'list') loadDiaries(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filter]);

  return (
      <div className="diary-container">
        {mode === 'list' && (
            <>
              <div className="section-header">
                <div>
                  <h1 className="section-title">기록</h1>
                  <p className="section-sub">하루를 가볍게 남겨보세요.</p>
                </div>
                <button
                    type="button"
                    className="btn-primary section-header-action"
                    onClick={() => { setEditingDiary(null); setMode('editor'); }}
                >
                  <NotebookPen size={15} /> 새 일기
                </button>
              </div>
              <DiaryListView
                  diaries={diaries}
                  searchKeyword={searchKeyword}
                  onSearchChange={setSearchKeyword}
                  onSearch={handleSearch}
                  filter={filter}
                  onFilterChange={setFilter}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={loadDiaries}
                  onEdit={(diary) => { setEditingDiary(diary); setMode('editor'); }}
                  onDelete={handleDelete}
                  onToggleFavorite={handleToggleFavorite}
                  loading={loading}
              />
            </>
        )}
        {mode === 'editor' && (
            <DiaryEditorView
                diary={editingDiary}
                onSave={handleDiarySaved}
                onCancel={() => setMode('list')}
            />
        )}
      </div>
  );
}

/* ===================== 오늘 화면 ===================== */

function TodayView() {
  const [subView, setSubView] = useState('home');

  if (subView === 'execution') {
    return <TodayExecutionView onBack={() => setSubView('home')} />;
  }

  return <TodayHomeView onOpenExecution={() => setSubView('execution')} />;
}

/*
 * 오늘 홈: 오늘 상태를 5초 안에 훑어보는 요약 화면.
 * "오늘 실행 조각" 카드를 누르면 실행 화면(TodayExecutionView)으로 이동한다.
 * 이 화면 자체엔 항목 추가/완료 같은 실행 동작이 없다 — 요약만 본다.
 */
const MOCK_WEEK_ADJUSTMENTS = { moved: 2, reduced: 1, held: 0 };
const MOCK_AREA_BREAKDOWN = [
  { key: 'study', label: '학업', pct: 55, className: 'area-study' },
  { key: 'life', label: '생활', pct: 30, className: 'area-life' },
  { key: 'personal', label: '개인', pct: 15, className: 'area-personal' },
];
const MOCK_RECENT_LOGS = ['감정', '수면', '컨디션', '메모'];
const MOCK_WEEK_FOCUS = [
  { key: 1, icon: '📘', title: '자료구조 복습 30분', tag: '학업', reason: '이해가 약했던 연결 리스트 정리' },
  { key: 2, icon: '🌙', title: '수면 6시간 이상 확보', tag: '생활', reason: '이번 주 평균 수면 6시간 목표' },
];
const MOCK_STUDY_PLAN = [
  { key: 1, subject: '자료구조', color: 'indigo', task: '연결 리스트 정리', pct: 70 },
  { key: 2, subject: '영어', color: 'blue', task: '단어 20개 암기', pct: 60 },
  { key: 3, subject: '프로젝트', color: 'orange', task: '요구사항 초안', pct: 40 },
];
const QUICK_LOG_TILES = [
  { key: 'emotion', label: '감정', desc: '기분 남기기', icon: '😊' },
  { key: 'sleep', label: '수면', desc: '수면 시간 기록', icon: '🌙' },
  { key: 'condition', label: '컨디션', desc: '컨디션 체크', icon: '❤️' },
  { key: 'memo', label: '한 줄 메모', desc: '간단 메모 남기기', icon: '📝' },
];

function TodayHomeView({ onOpenExecution }) {
  const today = scheduleBlockAPI.getTodayString();
  const [pieceCount, setPieceCount] = useState(null);
  const [doneCount, setDoneCount] = useState(null);
  const [quickLogOpen, setQuickLogOpen] = useState(null);
  const [quickLogValue, setQuickLogValue] = useState('');

  const formatDateShort = (dateString) => {
    const date = new Date(`${dateString}T00:00:00`);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} (${days[date.getDay()]})`;
  };

  useEffect(() => {
    let cancelled = false;
    scheduleBlockAPI.getByDate(today)
        .then((data) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : data?.content ?? [];
          setPieceCount(list.length);
          setDoneCount(list.filter((item) => item.status === 'DONE').length);
        })
        .catch(() => {
          if (!cancelled) {
            setPieceCount(0);
            setDoneCount(0);
          }
        });
    return () => { cancelled = true; };
  }, [today]);

  const handleQuickLogSave = () => {
    try {
      const key = `quickLog:${quickLogOpen}:${today}`;
      localStorage.setItem(key, quickLogValue);
    } catch {
      // 저장 실패는 조용히 무시
    }
    setQuickLogOpen(null);
    setQuickLogValue('');
  };

  return (
      <div className="today-home">
        <div className="today-home-header">
          <div>
            <h1 className="today-home-title">오늘</h1>
            <p className="today-home-sub">오늘 할 수 있는 작은 조각부터 시작해요.</p>
          </div>
          <div className="today-home-header-actions">
            <button type="button" className="overview-filter-btn"><SlidersHorizontal size={14} /> 필터</button>
            <div className="today-home-date-nav">
              <button type="button" aria-label="이전 날"><ChevronLeft size={15} /></button>
              <span><CalendarDays size={13} /> {formatDateShort(today)}</span>
              <button type="button" aria-label="다음 날"><ChevronRight size={15} /></button>
            </div>
          </div>
        </div>

        <div className="today-home-stat-row">
          <button type="button" className="home-stat-card clickable" onClick={onOpenExecution}>
            <div className="home-stat-label">오늘 실행 조각</div>
            <div className="home-stat-main">
              <span className="home-stat-value">{pieceCount ?? '–'}개</span>
              <ChevronRight size={15} className="home-stat-arrow" />
            </div>
            <div className="home-stat-sub">
              {pieceCount === null ? '불러오는 중...' : `완료 ${doneCount} · 남음 ${Math.max((pieceCount ?? 0) - (doneCount ?? 0), 0)}`}
            </div>
          </button>

          <button type="button" className="home-stat-card clickable" onClick={onOpenExecution}>
            <div className="home-stat-label">이번 주 조정</div>
            <div className="home-stat-main">
              <span className="home-stat-value">{MOCK_WEEK_ADJUSTMENTS.moved} · {MOCK_WEEK_ADJUSTMENTS.reduced} · {MOCK_WEEK_ADJUSTMENTS.held}</span>
              <ChevronRight size={15} className="home-stat-arrow" />
            </div>
            <div className="home-stat-sub">이동 · 줄이기 · 보류</div>
          </button>

          <div className="home-stat-card">
            <div className="home-stat-label">루틴 흐름</div>
            <div className="home-stat-value accent">좋음</div>
            <div className="home-stat-sub">이번 주 꾸준히 이어가고 있어요.</div>
          </div>

          <div className="home-stat-card">
            <div className="home-stat-label">영역별 흐름</div>
            <div className="home-area-legend">
              {MOCK_AREA_BREAKDOWN.map((area) => (
                  <span key={area.key}>{area.label} {area.pct}%</span>
              ))}
            </div>
            <div className="home-area-bar">
              {MOCK_AREA_BREAKDOWN.map((area) => (
                  <span key={area.key} className={area.className} style={{ width: `${area.pct}%` }} />
              ))}
            </div>
          </div>

          <div className="home-stat-card">
            <div className="home-stat-label">최근 기록</div>
            <div className="home-stat-value">{MOCK_RECENT_LOGS.length}개</div>
            <div className="home-stat-sub">{MOCK_RECENT_LOGS.join(' · ')} · 오늘 {MOCK_RECENT_LOGS.length}개 기록했어요.</div>
          </div>
        </div>

        <div className="today-home-grid">
          <section className="today-card home-focus-card">
            <div className="today-card-header">
              <span>이번 주 집중</span>
              <button type="button" className="home-reason-link">추천 이유 보기 ›</button>
            </div>
            <div className="home-focus-list">
              {MOCK_WEEK_FOCUS.map((focus) => (
                  <div key={focus.key} className="home-focus-row">
                    <span className="home-focus-icon">{focus.icon}</span>
                    <div className="home-focus-body">
                      <div className="home-focus-title">{focus.title}</div>
                      <div className="home-focus-reason">{focus.reason}</div>
                    </div>
                    <span className="home-focus-tag">{focus.tag}</span>
                  </div>
              ))}
            </div>
            <button type="button" className="btn-primary home-focus-cta" onClick={onOpenExecution}>
              오늘 계획으로 연결하기 →
            </button>
          </section>

          <section className="today-card">
            <div className="today-card-header"><span>공부계획</span></div>
            <div className="home-plan-list">
              {MOCK_STUDY_PLAN.map((plan) => (
                  <div key={plan.key} className="home-plan-row">
                    <span className={`home-plan-dot dot-${plan.color}`} />
                    <span className="home-plan-subject">{plan.subject}</span>
                    <span className="home-plan-task">{plan.task}</span>
                    <span className="home-plan-pct">{plan.pct}%</span>
                  </div>
              ))}
            </div>
            <button type="button" className="home-more-link">전체 계획 보기 →</button>
          </section>

          <section className="today-card">
            <div className="today-card-header"><span>빠른 기록</span></div>
            <div className="home-quicklog-grid">
              {QUICK_LOG_TILES.map((tile) => (
                  <button
                      type="button"
                      key={tile.key}
                      className="home-quicklog-tile"
                      onClick={() => { setQuickLogOpen(tile.key); setQuickLogValue(''); }}
                  >
                    <span className="home-quicklog-icon">{tile.icon}</span>
                    <span className="home-quicklog-label">{tile.label}</span>
                    <span className="home-quicklog-desc">{tile.desc}</span>
                  </button>
              ))}
            </div>
          </section>
        </div>

        <div className="today-home-banner">
          <div>
            <div className="today-home-banner-title">작은 조정이 내일의 여유를 만듭니다.</div>
            <p>오늘 한 가지를 가볍게 시작해 보세요.</p>
          </div>
          <span className="today-home-banner-icon">✨</span>
        </div>

        {quickLogOpen && (
            <div className="today-modal-backdrop" onClick={() => setQuickLogOpen(null)}>
              <div className="quicklog-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                <h3>{QUICK_LOG_TILES.find((tile) => tile.key === quickLogOpen)?.label} 기록</h3>
                <textarea
                    rows="3"
                    placeholder="가볍게 한두 줄로 남겨보세요."
                    value={quickLogValue}
                    onChange={(event) => setQuickLogValue(event.target.value)}
                    autoFocus
                />
                <div className="quicklog-modal-actions">
                  <button type="button" className="btn-ghost" onClick={() => setQuickLogOpen(null)}>취소</button>
                  <button type="button" className="btn-primary" onClick={handleQuickLogSave}>저장</button>
                </div>
              </div>
            </div>
        )}
      </div>
  );
}

function TodayExecutionView({ onBack }) {
  const today = scheduleBlockAPI.getTodayString();
  const emptyForm = {
    title: '',
    priority: 'SHOULD',
    startTime: null,
    endTime: null,
    scope: 'TODAY',
    estimatedMinutes: 30,
    category: null,
    intensity: null,
    memo: '',
  };

  const [items, setItems] = useState([]);
  const [pastItems, setPastItems] = useState([]);
  const [pastShowAll, setPastShowAll] = useState(false);
  const [pastCardCollapsed, setPastCardCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingItemIds, setPendingItemIds] = useState(() => new Set());
  const [form, setForm] = useState(emptyForm);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [timeSectionOpen, setTimeSectionOpen] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [longTermMenuOpen, setLongTermMenuOpen] = useState(false);
  const [estimatedCustomOpen, setEstimatedCustomOpen] = useState(false);
  const [estimatedSectionOpen, setEstimatedSectionOpen] = useState(false);
  const [memoSectionOpen, setMemoSectionOpen] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [reduceTarget, setReduceTarget] = useState(null);
  const [reduceForm, setReduceForm] = useState({
    reducedTitle: '',
    memo: '',
    timeMode: 'KEEP',
    startTime: '',
    endTime: '',
  });
  const [reduceError, setReduceError] = useState('');
  const [selectedStart, setSelectedStart] = useState(null);
  const [endMode, setEndMode] = useState('DURATION');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // ── 오늘 마무리 (백엔드 quick_logs 전까지 로컬 저장) ──
  const finishStorageKey = `dayFinish:${today}`;
  const [finish, setFinish] = useState(() => {
    try {
      const saved = localStorage.getItem(finishStorageKey);
      return saved ? JSON.parse(saved) : { emotion: null, note: '', carry: false };
    } catch {
      return { emotion: null, note: '', carry: false };
    }
  });

  const updateFinish = (patch) => {
    setFinish((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(finishStorageKey, JSON.stringify(next));
      } catch {
        // 저장 실패는 조용히 무시 (화면 상태는 유지)
      }
      return next;
    });
  };

  const priorityOptions = [
    { value: 'MUST', label: '🎯 오늘의 핵심', badge: '🎯 오늘의 핵심', className: 'priority-must' },
    { value: 'SHOULD', label: '🌱 하면 좋은 것', badge: '🌱 하면 좋은 것', className: 'priority-should' },
    { value: 'OPTIONAL', label: '☕ 여유 있으면', badge: '☕ 여유 있으면', className: 'priority-optional' },
  ];

  // 기간 스코프. TODAY만 실동작하고 나머지는 저장처 미정이라 선택은 되지만 "준비 중"으로 안내한다.
  const SCOPE_LABELS = {
    TODAY: '오늘 조각',
    WEEK: '이번 주 조각',
    MONTH: '이번 달 집중',
    LATER: '나중에',
    PERIOD: '이번 학기 목표', // 방학이면 '이번 방학 목표'로 바뀔 예정(운영기간 도메인 미정)
    YEAR: '올해 방향',
  };
  const primaryScopeOptions = ['TODAY', 'WEEK', 'MONTH', 'LATER'];
  const longTermScopeOptions = ['PERIOD', 'YEAR'];

  // 영역. 저장 컬럼이 없어 이번 화면에서는 표시만 하고 저장하지 않는다.
  const categoryOptions = [
    { value: 'STUDY', label: '공부', icon: '📘' },
    { value: 'PROJECT', label: '프로젝트', icon: '⭐' },
    { value: 'LIFE', label: '생활', icon: '🙂' },
    { value: 'ROUTINE', label: '루틴', icon: '🔁' },
    { value: 'PERSONAL', label: '개인', icon: '👤' },
    { value: 'ETC', label: '기타', icon: '⋯' },
  ];

  const estimatedMinuteOptions = [10, 30, 60];

  // 예상 시간(estimatedMinutes)을 시간 정하기 미리보기/안내 문구에서 재사용하기 위한 포맷터
  const formatMinutesLabel = (minutes) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
  };

  const formatDateKo = (dateString) => {
    const date = new Date(`${dateString}T00:00:00`);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
  };

  const toMinutes = (time) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  };

  const toTime = (minutes) => {
    const normalized = minutes % (24 * 60);
    const hour = String(Math.floor(normalized / 60)).padStart(2, '0');
    const minute = String(normalized % 60).padStart(2, '0');
    return `${hour}:${minute}`;
  };

  const formatTime = (value) => {
    if (!value) return '';
    const text = String(value);
    const timeMatch = text.match(/T(\d{2}:\d{2})/) ?? text.match(/^(\d{2}:\d{2})/);
    return timeMatch?.[1] ?? '';
  };

  const formatTimeRange = (start, end) => {
    if (!start || !end) return '';
    const startTime = formatTime(start);
    const endTime = formatTime(end);
    if (!startTime || !endTime) return '';
    return `${startTime} - ${endTime}`;
  };

  const getDatePart = (value) => {
    if (!value) return '';
    const text = String(value);
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? '';
  };

  const formatLocalDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getTomorrowString = () => {
    const tomorrow = new Date(`${today}T00:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatLocalDate(tomorrow);
  };

  const toScheduleDateTime = (time) => {
    if (!time) return null;
    return `${today}T${time.slice(0, 5)}:00`;
  };

  const toLocalDateTime = (date, time) => {
    if (!date || !time) return null;
    return `${date}T${time.slice(0, 5)}:00`;
  };

  const applyTime = (start = selectedStart, duration = form.estimatedMinutes || 30) => {
    if (!start || !duration) return;
    const end = toTime(toMinutes(start) + duration);
    setForm((prev) => ({ ...prev, startTime: start, endTime: end }));
  };

  const clearTime = () => {
    setForm((prev) => ({ ...prev, startTime: null, endTime: null }));
    setSelectedStart(null);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setSelectedStart(null);
    setEndMode('DURATION');
    setAddModalOpen(false);
    setTimeSectionOpen(false);
    setScopeMenuOpen(false);
    setLongTermMenuOpen(false);
    setEstimatedCustomOpen(false);
    setEstimatedSectionOpen(false);
    setMemoSectionOpen(false);
  };

  const getItemId = (item) => item.scheduleBlockId ?? item.schedule_block_id ?? item.id;
  const getItemTitle = (item) => item.title ?? item.name ?? '제목 없음';
  const getItemMemo = (item) => item.memo ?? item.content;
  const getItemStatus = (item) => item.status ?? 'PLANNED';
  const getItemStart = (item) => item.startTime ?? item.start_time;
  const getItemEnd = (item) => item.endTime ?? item.end_time;
  const getItemBlockType = (item) => item.blockType ?? item.block_type;
  const getItemBlockDate = (item) => {
    const blockDate = item.blockDate ?? item.block_date ?? getDatePart(getItemStart(item));
    return blockDate || today;
  };
  const getPendingKey = (itemId) => String(itemId);
  const hasFixedTime = (item) => {
    return getItemBlockType(item) === 'TIME_FIXED' && Boolean(getItemStart(item) && getItemEnd(item));
  };

  const setItemPending = (itemId, isPending) => {
    const pendingKey = getPendingKey(itemId);
    setPendingItemIds((prev) => {
      const next = new Set(prev);
      if (isPending) {
        next.add(pendingKey);
      } else {
        next.delete(pendingKey);
      }
      return next;
    });
  };

  const fetchPastItems = async () => {
    try {
      const data = await scheduleBlockAPI.getPending(today);
      setPastItems(Array.isArray(data) ? data : data?.content ?? []);
    } catch {
      // 지난 계획 조회 실패는 오늘 화면을 막지 않는다.
      setPastItems([]);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await scheduleBlockAPI.getByDate(today);
      setItems(Array.isArray(data) ? data : data?.content ?? []);
      await fetchPastItems();
    } catch (e) {
      setError(e.message || '오늘 해볼 것을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartSelect = (start) => {
    setSelectedStart(start);
    if (endMode === 'DURATION') {
      applyTime(start, form.estimatedMinutes || 30);
    } else {
      setForm((prev) => {
        const next = { ...prev, startTime: start || null };
        if (start && prev.endTime && toMinutes(prev.endTime) > toMinutes(start)) {
          next.estimatedMinutes = toMinutes(prev.endTime) - toMinutes(start);
        }
        return next;
      });
    }
  };

  // 예상 시간 칩/직접입력에서 호출. 시간 정하기가 소요 시간 모드로 열려 있으면
  // 종료 시간도 즉시 다시 계산해 예상 시간과 항상 같은 값을 쓰게 한다.
  const handleEstimatedMinutesChange = (minutes) => {
    setForm((prev) => {
      const next = { ...prev, estimatedMinutes: minutes };
      if (endMode === 'DURATION' && selectedStart && minutes) {
        next.startTime = selectedStart;
        next.endTime = toTime(toMinutes(selectedStart) + minutes);
      }
      return next;
    });
  };

  const handleEndTimeSelect = (end) => {
    setForm((prev) => {
      const next = { ...prev, endTime: end || null };
      if (prev.startTime && end && toMinutes(end) > toMinutes(prev.startTime)) {
        next.estimatedMinutes = toMinutes(end) - toMinutes(prev.startTime);
      }
      return next;
    });
  };

  const handleEndModeChange = (mode) => {
    setEndMode(mode);
    if (mode === 'DURATION') {
      if (selectedStart) applyTime(selectedStart, form.estimatedMinutes || 30);
    } else if (!form.startTime && selectedStart) {
      setForm((prev) => ({ ...prev, startTime: selectedStart }));
    }
  };

  const createBlock = async ({ title, priority, startTime = null, endTime = null, memo = null }) => {
    const hasTime = Boolean(startTime && endTime);
    await scheduleBlockAPI.create({
      blockDate: today,
      title,
      priority,
      blockType: hasTime ? 'TIME_FIXED' : 'TASK',
      startTime: hasTime ? toScheduleDateTime(startTime) : null,
      endTime: hasTime ? toScheduleDateTime(endTime) : null,
      memo: memo || null,
    });
  };

  const handleCreate = async () => {
    const title = form.title.trim();
    if (!title || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      await createBlock({
        title,
        priority: form.priority,
        startTime: form.startTime,
        endTime: form.endTime,
        memo: form.memo,
      });
      resetForm();
      await fetchItems();
    } catch (e) {
      setError(e.message || '오늘 해볼 것을 추가하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTitleKeyDown = (event) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    handleCreate();
  };

  const handleComplete = async (item) => {
    const itemId = getItemId(item);
    if (!itemId) return;
    const pendingKey = getPendingKey(itemId);
    if (pendingItemIds.has(pendingKey)) return;

    const itemStatus = getItemStatus(item);
    if (itemStatus === 'CANCELLED') {
      setError('이 항목은 여기서 완료 상태를 바꿀 수 없습니다.');
      return;
    }

    setItemPending(itemId, true);
    setError('');
    try {
      if (itemStatus === 'DONE') {
        await scheduleBlockAPI.uncomplete(itemId);
      } else {
        await scheduleBlockAPI.complete(itemId);
      }
      await fetchItems();
    } catch (e) {
      setError(e.message || '상태를 바꾸지 못했습니다.');
    } finally {
      setItemPending(itemId, false);
    }
  };

  const handleDelete = async (item) => {
    const itemId = getItemId(item);
    if (!itemId || !confirm('이 항목을 삭제할까요?')) return;
    if (pendingItemIds.has(getPendingKey(itemId))) return;

    setOpenActionMenuId(null);
    setItemPending(itemId, true);
    setError('');
    try {
      await scheduleBlockAPI.delete(itemId);
      await fetchItems();
    } catch (e) {
      setError(e.message || '삭제하지 못했습니다.');
    } finally {
      setItemPending(itemId, false);
    }
  };

  const runItemAction = async (item, action) => {
    const itemId = getItemId(item);
    if (!itemId) return;
    if (pendingItemIds.has(getPendingKey(itemId))) return;

    setOpenActionMenuId(null);
    setItemPending(itemId, true);
    setError('');
    try {
      await action(itemId);
      await fetchItems();
    } catch (e) {
      setError(e.message || '요청을 처리하지 못했습니다.');
    } finally {
      setItemPending(itemId, false);
    }
  };

  const handleMoveTomorrow = (item) => {
    runItemAction(item, (itemId) => scheduleBlockAPI.move(itemId, getTomorrowString(), null));
  };

  const handleReduce = (item) => {
    const currentTitle = getItemTitle(item);
    const startTime = formatTime(getItemStart(item));
    const endTime = formatTime(getItemEnd(item));
    setOpenActionMenuId(null);
    setReduceTarget(item);
    setReduceForm({
      reducedTitle: currentTitle,
      memo: '',
      timeMode: 'KEEP',
      startTime,
      endTime,
    });
    setReduceError('');
  };

  const closeReduceModal = () => {
    setReduceTarget(null);
    setReduceForm({
      reducedTitle: '',
      memo: '',
      timeMode: 'KEEP',
      startTime: '',
      endTime: '',
    });
    setReduceError('');
  };

  const handleReduceSubmit = async (event) => {
    event.preventDefault();
    if (!reduceTarget) return;

    const itemId = getItemId(reduceTarget);
    if (!itemId) return;
    if (pendingItemIds.has(getPendingKey(itemId))) return;

    const reducedTitle = reduceForm.reducedTitle.trim();
    const memo = reduceForm.memo.trim();
    const canChangeTime = hasFixedTime(reduceTarget);

    if (!reducedTitle) {
      setReduceError('작게 줄인 이름을 입력해 주세요.');
      return;
    }

    if (reduceForm.timeMode === 'SHRINK' && !canChangeTime) {
      setReduceError('시간이 정해진 항목만 시간 축소를 할 수 있어요.');
      return;
    }

    if (reduceForm.timeMode === 'CLEAR' && !canChangeTime) {
      setReduceError('정해진 시간이 있는 항목만 시간 해제를 할 수 있어요.');
      return;
    }

    if (reduceForm.timeMode === 'SHRINK') {
      if (!reduceForm.startTime || !reduceForm.endTime) {
        setReduceError('시작 시간과 끝나는 시간을 입력해 주세요.');
        return;
      }

      if (toMinutes(reduceForm.endTime) <= toMinutes(reduceForm.startTime)) {
        setReduceError('끝나는 시간은 시작 시간보다 뒤로 설정해 주세요.');
        return;
      }
    }

    const payload = {
      reducedTitle,
      timeMode: reduceForm.timeMode,
      memo: memo || null,
    };

    if (reduceForm.timeMode === 'SHRINK') {
      const blockDate = getItemBlockDate(reduceTarget);
      payload.blockType = 'TIME_FIXED';
      payload.startTime = toLocalDateTime(blockDate, reduceForm.startTime);
      payload.endTime = toLocalDateTime(blockDate, reduceForm.endTime);
    }

    if (reduceForm.timeMode === 'CLEAR') {
      payload.blockType = 'TASK';
      payload.startTime = null;
      payload.endTime = null;
    }

    setItemPending(itemId, true);
    setReduceError('');
    setError('');
    try {
      await scheduleBlockAPI.reduce(itemId, payload);
      closeReduceModal();
      await fetchItems();
    } catch (e) {
      setReduceError(e.message || '작게 줄이기를 적용하지 못했습니다.');
    } finally {
      setItemPending(itemId, false);
    }
  };

  const handleHold = (item) => {
    if (!confirm('이 항목을 보류할까요?')) return;
    runItemAction(item, (itemId) => scheduleBlockAPI.hold(itemId, null));
  };

  const toggleActionMenu = (itemId) => {
    const menuId = getPendingKey(itemId);
    setOpenActionMenuId((currentId) => (currentId === menuId ? null : menuId));
  };

  const isAdjustableItem = (item) => getItemStatus(item) === 'PLANNED';

  const getStatusLabel = (status) => {
    if (status === 'HOLD') return '보류됨';
    if (status === 'CANCELLED') return '취소됨';
    return '';
  };

  const handleBringToToday = (item) => {
    runItemAction(item, (itemId) => scheduleBlockAPI.move(itemId, today, null));
  };

  const handlePastHold = (item) => {
    if (!confirm('이 항목을 보류할까요? 보류한 항목은 이 목록에 다시 나타나지 않아요.')) return;
    runItemAction(item, (itemId) => scheduleBlockAPI.hold(itemId, null));
  };

  const formatShortDateKo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  // 지난 계획 정리 메타 표기. "미완료/실패" 등 압박 어감을 피하고 날짜만 중립적으로 표기한다.
  const getPastItemMeta = (item) => {
    const dateLabel = formatShortDateKo(getItemBlockDate(item));
    const timeLabel = formatTimeRange(getItemStart(item), getItemEnd(item));
    return [dateLabel && `${dateLabel} 계획`, timeLabel].filter(Boolean).join(' · ');
  };
  const timeLabel = formatTimeRange(form.startTime, form.endTime);
  const reduceTargetId = reduceTarget ? getItemId(reduceTarget) : null;
  const isReduceSubmitting = reduceTargetId ? pendingItemIds.has(getPendingKey(reduceTargetId)) : false;
  const reduceTargetHasTime = reduceTarget ? hasFixedTime(reduceTarget) : false;
  const reduceExistingTime = reduceTarget
      ? formatTimeRange(getItemStart(reduceTarget), getItemEnd(reduceTarget)).replace(' - ', ' ~ ') || '정해지지 않음'
      : '정해지지 않음';
  const visiblePastItems = pastShowAll ? pastItems : pastItems.slice(0, 2);

  const priorityGroups = [
    { key: 'MUST', label: '오늘의 핵심', icon: '🎯', className: 'group-must' },
    { key: 'SHOULD', label: '하면 좋은 것', icon: '🌱', className: 'group-should' },
    { key: 'OPTIONAL', label: '여유 있으면', icon: '☕', className: 'group-optional' },
  ];

  const mustItems = items.filter((item) => item.priority === 'MUST');
  const mustDoneCount = mustItems.filter((item) => getItemStatus(item) === 'DONE').length;

  const emotionOptions = [
    { value: 1, label: '나쁨', face: '😶' },
    { value: 2, label: '보통', face: '🙂' },
    { value: 3, label: '좋음', face: '😊' },
  ];

  /*
   * scope별 조각 추가 모달 필드 노출 규칙.
   * 오늘 조각 = 실행, 이번 주 조각 = 배분 후보, 이번 달 집중 = 방향,
   * 나머지(나중에/학기·방학 목표/올해 방향) = 방향·정리 중심.
   * 같은 폼을 억지로 재사용하지 않고 scope마다 필요한 입력만 보여준다.
   */
  const isWeekScope = form.scope === 'WEEK';
  const showEstimatedField = form.scope === 'TODAY' || form.scope === 'WEEK';
  const showPriorityField = form.scope === 'TODAY' || form.scope === 'WEEK';
  const showIntensityField = form.scope === 'MONTH';
  const showTimeSection = form.scope === 'TODAY';

  const intensityOptions = [
    { value: 'LIGHT', label: '가볍게', icon: '🌱' },
    { value: 'NORMAL', label: '보통', icon: '🙂' },
    { value: 'FOCUSED', label: '집중', icon: '🎯' },
  ];

  return (
      <div className="today-layout">
        <div className="today-main">
          {onBack && (
              <button type="button" className="today-back-btn" onClick={onBack}>
                <ChevronLeft size={15} /> 오늘 홈으로
              </button>
          )}
          <div className="today-page-header">
            <div>
              <h1 className="today-page-title">오늘도 한 조각씩, 꾸준히 나아가요! 🌱</h1>
              <div className="today-page-date">{formatDateKo(today)}</div>
            </div>
            <button
                type="button"
                className="today-add-open-btn"
                onClick={() => setAddModalOpen(true)}
            >
              <Plus size={15} /> 조각 추가
            </button>
          </div>

          {error && (
              <div className="error-message today-error">
                {error}
                <button type="button" onClick={() => setError('')} aria-label="에러 닫기">×</button>
              </div>
          )}

          {/* ── 오늘의 할 일 (우선순위별 그룹) ── */}
          <section className="today-card">
            {loading && <div className="loading">불러오는 중...</div>}

            {!loading && priorityGroups.map((group) => {
              const groupItems = items.filter((item) => item.priority === group.key);
              if (groupItems.length === 0) return null;
              const doneInGroup = groupItems.filter((item) => getItemStatus(item) === 'DONE').length;

              return (
                  <div key={group.key} className={`today-group ${group.className}`}>
                    <div className="today-group-header">
                      <span>{group.icon} {group.label}</span>
                      <span className="today-group-count">{doneInGroup} / {groupItems.length} 완료</span>
                    </div>

                    {groupItems.map((item) => {
                      const itemId = getItemId(item);
                      const isPending = pendingItemIds.has(getPendingKey(itemId));
                      const itemMemo = getItemMemo(item);
                      const itemTime = formatTimeRange(getItemStart(item), getItemEnd(item));
                      const itemStatus = getItemStatus(item);
                      const isDone = itemStatus === 'DONE';
                      const statusLabel = getStatusLabel(itemStatus);
                      const menuId = getPendingKey(itemId);
                      const isMenuOpen = openActionMenuId === menuId;
                      const adjustable = isAdjustableItem(item);

                      return (
                          <div key={itemId ?? getItemTitle(item)} className={`today-group-row ${isDone ? 'is-done' : ''}`}>
                            <span className={`today-group-icon ${group.className}`}>{group.icon}</span>
                            <div className="today-row-body">
                              <span className="today-row-title">{getItemTitle(item)}</span>
                              {statusLabel && <span className="today-status-badge">{statusLabel}</span>}
                              {itemMemo && <div className="today-row-memo">{itemMemo}</div>}
                            </div>
                            {itemTime && <span className="today-row-time">{itemTime}</span>}
                            {adjustable && (
                                <button
                                    type="button"
                                    className="today-move-tomorrow-btn"
                                    onClick={() => handleMoveTomorrow(item)}
                                    disabled={isPending || !itemId}
                                >
                                  내일로 이동
                                </button>
                            )}
                            {!isDone && itemStatus !== 'CANCELLED' && (
                                // 시작하기: 도메인에 IN_PROGRESS 상태가 없어 아직 죽은 버튼이다.
                                // 상태 모델 확장 여부가 정해지면 로컬 표시용 or 실제 상태로 연결.
                                <button type="button" className="today-start-btn" disabled>
                                  시작하기
                                </button>
                            )}
                            {isDone && (
                                // 정리 보기: 조각별 이벤트 이력을 보여줄 API가 아직 없어 죽은 버튼이다.
                                <button type="button" className="today-review-btn" disabled>
                                  정리 보기
                                </button>
                            )}
                            <button
                                type="button"
                                className={`today-row-state-btn ${isDone ? 'done' : ''}`}
                                onClick={() => handleComplete(item)}
                                disabled={isPending || !itemId || itemStatus === 'CANCELLED'}
                                aria-busy={isPending}
                            >
                              {isDone ? <>완료 <span className="check">✓</span></> : '완료하기'}
                            </button>
                            {adjustable && (
                                <div className="today-item-menu-wrap">
                                  <button
                                      className="row-icon-btn"
                                      type="button"
                                      onClick={() => toggleActionMenu(itemId)}
                                      disabled={isPending || !itemId}
                                      aria-haspopup="menu"
                                      aria-expanded={isMenuOpen}
                                      aria-label="더보기"
                                      title="더보기"
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                  {isMenuOpen && (
                                      <div className="today-item-menu" role="menu">
                                        <button type="button" role="menuitem" onClick={() => handleReduce(item)} disabled={isPending}>
                                          작게 줄이기
                                        </button>
                                        <button type="button" role="menuitem" onClick={() => handleHold(item)} disabled={isPending}>
                                          보류
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="danger"
                                            onClick={() => handleDelete(item)}
                                            disabled={isPending}
                                        >
                                          삭제
                                        </button>
                                      </div>
                                  )}
                                </div>
                            )}
                          </div>
                      );
                    })}
                  </div>
              );
            })}

            {!loading && items.length === 0 && (
                <div className="today-empty-state">
                  <div className="today-empty-icon">📝</div>
                  <p>오늘 해볼 것이 없어요</p>
                  <p>위 [오늘 계획 추가] 버튼으로 하나만 가볍게 추가해보세요.</p>
                </div>
            )}
          </section>

          {/* ── 지난 계획 정리 ── */}
          {pastItems.length > 0 && (
              <section className="today-card past-card">
                <button
                    type="button"
                    className="past-card-toggle"
                    onClick={() => setPastCardCollapsed((collapsed) => !collapsed)}
                >
                  <span>지난 계획 정리 <em>{pastItems.length}</em></span>
                  {pastCardCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>

                {!pastCardCollapsed && (
                    <div className="past-card-body">
                      {visiblePastItems.map((item) => {
                        const itemId = getItemId(item);
                        const isPending = pendingItemIds.has(getPendingKey(itemId));
                        const menuId = `past-${getPendingKey(itemId)}`;
                        const isMenuOpen = openActionMenuId === menuId;

                        return (
                            <div key={itemId ?? getItemTitle(item)} className="past-row">
                              <NotebookPen size={15} className="past-row-doc-icon" />
                              <span className="past-row-title">{getItemTitle(item)}</span>
                              <span className="past-row-badge">{getPastItemMeta(item)}</span>
                              <div className="past-row-actions">
                                <button
                                    type="button"
                                    className="past-action-btn primary"
                                    onClick={() => handleBringToToday(item)}
                                    disabled={isPending || !itemId}
                                >
                                  오늘로 가져오기
                                </button>
                                <button
                                    type="button"
                                    className="past-action-btn"
                                    onClick={() => handlePastHold(item)}
                                    disabled={isPending || !itemId}
                                >
                                  보류
                                </button>
                                <div className="today-item-menu-wrap">
                                  <button
                                      type="button"
                                      className="row-icon-btn"
                                      onClick={() => setOpenActionMenuId((current) => (current === menuId ? null : menuId))}
                                      disabled={isPending || !itemId}
                                      aria-haspopup="menu"
                                      aria-expanded={isMenuOpen}
                                      aria-label="더보기"
                                  >
                                    <MoreVertical size={15} />
                                  </button>
                                  {isMenuOpen && (
                                      <div className="today-item-menu" role="menu">
                                        <button
                                            type="button"
                                            role="menuitem"
                                            className="danger"
                                            onClick={() => handleDelete(item)}
                                            disabled={isPending}
                                        >
                                          삭제
                                        </button>
                                      </div>
                                  )}
                                </div>
                              </div>
                            </div>
                        );
                      })}

                      {pastItems.length > 2 && (
                          <button
                              type="button"
                              className="past-more-btn"
                              onClick={() => setPastShowAll((showAll) => !showAll)}
                          >
                            {pastShowAll ? '간단히 보기' : `더 보기 (${pastItems.length - 2}개)`}
                          </button>
                      )}
                    </div>
                )}
              </section>
          )}

          <div className="today-tip-banner">
            💡 <strong>Tip.</strong> 계획이 틀어져도 괜찮아요. 다시 조정하면 됩니다. 작은 조각이 큰 변화를 만듭니다.
          </div>

          {/* ── 오늘 마무리 ── */}
          <section className="today-card finish-card">
            <div className="today-card-header">
              <Moon size={16} className="header-icon-indigo" />
              <span>오늘 마무리</span>
            </div>

            <div className="finish-body">
              <div className="finish-emotion">
                <div className="finish-label">오늘의 감정</div>
                <div className="finish-emotion-options">
                  {emotionOptions.map((option) => (
                      <button
                          type="button"
                          key={option.value}
                          className={`finish-emotion-btn ${finish.emotion === option.value ? 'active' : ''}`}
                          onClick={() => updateFinish({ emotion: finish.emotion === option.value ? null : option.value })}
                          aria-pressed={finish.emotion === option.value}
                      >
                        <span className="finish-face">{option.face}</span>
                        <span>{option.label}</span>
                      </button>
                  ))}
                </div>
              </div>

              <div className="finish-note">
                <div className="finish-label">한 줄 회고 (선택)</div>
                <input
                    className="input"
                    type="text"
                    placeholder="오늘 하루는 어땠나요?"
                    value={finish.note}
                    onChange={(event) => updateFinish({ note: event.target.value })}
                />
                <label className="finish-carry">
                  <input
                      type="checkbox"
                      checked={finish.carry}
                      onChange={(event) => updateFinish({ carry: event.target.checked })}
                  />
                  <span>내일로 가져갈 것 선택</span>
                </label>
              </div>
            </div>
          </section>
        </div>

        {/* ── 우측 사이드 컬럼 ── */}
        <aside className="today-side">
          <div className="side-card ai-teaser-card">
            <div className="side-card-header">
              <Sparkles size={15} className="header-icon-indigo" />
              <span>AI 도우미</span>
            </div>
            <p className="ai-teaser-desc">오늘 계획이 고민된다면 AI에게 물어보세요.</p>
            <button type="button" className="btn-primary ai-teaser-btn" onClick={() => setAiPanelOpen(true)}>
              AI에게 오늘 계획 물어보기
            </button>
          </div>

          <div className="side-card">
            <div className="side-card-header"><span>오늘 한눈에</span></div>
            <ul className="side-summary-list">
              <li>
                <span className="side-summary-icon">🎯</span>
                <span className="side-summary-label">오늘의 핵심</span>
                <span className="side-summary-value">{mustDoneCount} / {mustItems.length}</span>
              </li>
              <li>
                <span className="side-summary-icon">🌱</span>
                <span className="side-summary-label">하면 좋은 것</span>
                <span className="side-summary-value">{items.filter((item) => item.priority === 'SHOULD').length}</span>
              </li>
              <li>
                <span className="side-summary-icon">☕</span>
                <span className="side-summary-label">여유 있으면</span>
                <span className="side-summary-value">{items.filter((item) => item.priority === 'OPTIONAL').length}</span>
              </li>
              <li>
                <span className="side-summary-icon">🗂️</span>
                <span className="side-summary-label">지난 계획 정리</span>
                <span className="side-summary-value">{pastItems.length}</span>
              </li>
            </ul>
          </div>

          <div className="side-card">
            <div className="side-card-header"><span>오늘 시간표</span></div>
            {/* 시간표 도메인 API가 생기면 아래 mock 배열을 fetch 결과로 교체 */}
            <ul className="side-timetable-list">
              {MOCK_TODAY_TIMETABLE.map((entry) => (
                  <li key={entry.time} className="side-timetable-row">
                    <span className={`side-timetable-dot dot-${entry.color}`} />
                    <span className="side-timetable-time">{entry.time}</span>
                    <span className="side-timetable-title">{entry.title}</span>
                    <span className="side-timetable-place">{entry.place}</span>
                  </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ── 조각 추가 모달 ── */}
        {addModalOpen && (
            <div className="today-modal-backdrop add-piece-backdrop" onClick={() => setAddModalOpen(false)}>
              <div
                  className="add-piece-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="add-piece-title"
                  onClick={(event) => event.stopPropagation()}
              >
                <div className="add-piece-header">
                  <h2 id="add-piece-title">조각 추가</h2>
                  <button type="button" className="ai-close-btn" onClick={() => setAddModalOpen(false)} aria-label="닫기">
                    <X size={18} />
                  </button>
                </div>

                <div className="add-piece-field">
                  <label htmlFor="add-piece-title-input">무엇을 해볼까요?</label>
                  <div className="add-piece-title-row">
                    <input
                        id="add-piece-title-input"
                        className="input"
                        type="text"
                        placeholder="예: 자료구조 연결 리스트 복습하기"
                        value={form.title}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                        onKeyDown={handleTitleKeyDown}
                        autoFocus
                    />

                    <div className="scope-dropdown-wrap">
                      <button
                          type="button"
                          className="scope-dropdown-btn"
                          onClick={() => setScopeMenuOpen((open) => !open)}
                          aria-haspopup="menu"
                          aria-expanded={scopeMenuOpen}
                      >
                        {SCOPE_LABELS[form.scope]} <ChevronDown size={13} />
                      </button>

                      {scopeMenuOpen && (
                          <div className="scope-dropdown-menu" role="menu">
                            {primaryScopeOptions.map((scopeValue) => (
                                <button
                                    type="button"
                                    key={scopeValue}
                                    role="menuitem"
                                    className={form.scope === scopeValue ? 'active' : ''}
                                    onClick={() => {
                                      setForm((prev) => ({ ...prev, scope: scopeValue }));
                                      setScopeMenuOpen(false);
                                    }}
                                >
                                  {SCOPE_LABELS[scopeValue]}
                                  {form.scope === scopeValue && <span className="scope-check">✓</span>}
                                </button>
                            ))}

                            <div className="scope-dropdown-divider" />

                            <button
                                type="button"
                                className="scope-dropdown-expand"
                                onClick={() => setLongTermMenuOpen((open) => !open)}
                                aria-expanded={longTermMenuOpen}
                            >
                              더 긴 계획으로 저장 <ChevronRight size={13} />
                            </button>

                            {longTermMenuOpen && longTermScopeOptions.map((scopeValue) => (
                                <button
                                    type="button"
                                    key={scopeValue}
                                    role="menuitem"
                                    className={`scope-dropdown-sub ${form.scope === scopeValue ? 'active' : ''}`}
                                    onClick={() => {
                                      setForm((prev) => ({ ...prev, scope: scopeValue }));
                                      setScopeMenuOpen(false);
                                    }}
                                >
                                  {SCOPE_LABELS[scopeValue]}
                                  {form.scope === scopeValue && <span className="scope-check">✓</span>}
                                </button>
                            ))}
                          </div>
                      )}
                    </div>
                  </div>

                  {form.scope !== 'TODAY' && (
                      <p className="add-piece-scope-note">지금은 이 조각도 오늘 조각으로 저장돼요. {SCOPE_LABELS[form.scope]}은 준비 중이에요.</p>
                  )}
                </div>

                {/* 예상 시간: 저장 컬럼이 아직 없어 화면만 우선 구성 — estimated_minutes 컬럼 추가 후 연결 */}
                {showEstimatedField && (
                    <div className="add-piece-field">
                      {isWeekScope && !estimatedSectionOpen ? (
                          <button
                              type="button"
                              className="add-piece-collapse-toggle"
                              onClick={() => setEstimatedSectionOpen(true)}
                          >
                            <Plus size={14} /> 예상 시간 추가 (선택)
                          </button>
                      ) : (
                          <>
                            <label>예상 시간 {isWeekScope && <span className="add-piece-optional-tag">선택</span>}</label>
                            <div className="add-piece-chip-row">
                              {estimatedMinuteOptions.map((minutes) => (
                                  <button
                                      type="button"
                                      key={minutes}
                                      className={`add-piece-chip ${!estimatedCustomOpen && form.estimatedMinutes === minutes ? 'active' : ''}`}
                                      onClick={() => { handleEstimatedMinutesChange(minutes); setEstimatedCustomOpen(false); }}
                                  >
                                    {minutes < 60 ? `${minutes}분` : '1시간'}
                                  </button>
                              ))}
                              <button
                                  type="button"
                                  className={`add-piece-chip ${estimatedCustomOpen ? 'active' : ''}`}
                                  onClick={() => setEstimatedCustomOpen((open) => !open)}
                              >
                                직접 입력
                              </button>
                            </div>
                            {estimatedCustomOpen && (
                                <input
                                    className="input add-piece-custom-minutes"
                                    type="number"
                                    min="1"
                                    placeholder="분 단위로 입력"
                                    value={form.estimatedMinutes ?? ''}
                                    onChange={(event) => handleEstimatedMinutesChange(event.target.value ? Number(event.target.value) : null)}
                                />
                            )}
                          </>
                      )}
                    </div>
                )}

                {showPriorityField && (
                    <div className="add-piece-field">
                      <label>중요도</label>
                      <div className="today-priority-group" aria-label="우선순위 선택">
                        {priorityOptions.map((option) => (
                            <button
                                type="button"
                                key={option.value}
                                className={`today-priority-pill ${option.className} ${form.priority === option.value ? 'active' : ''}`}
                                onClick={() => setForm({ ...form, priority: option.value })}
                                aria-pressed={form.priority === option.value}
                            >
                              {option.label}
                            </button>
                        ))}
                      </div>
                    </div>
                )}

                {/* 집중 강도: DailyPlan.intensity(LIGHT/NORMAL/FOCUSED) 표현을 빌려온 것 — 저장 연결은 아직 없음 */}
                {showIntensityField && (
                    <div className="add-piece-field">
                      <label>집중 강도</label>
                      <div className="add-piece-chip-row">
                        {intensityOptions.map((option) => (
                            <button
                                type="button"
                                key={option.value}
                                className={`add-piece-chip ${form.intensity === option.value ? 'active' : ''}`}
                                onClick={() => setForm((prev) => ({ ...prev, intensity: prev.intensity === option.value ? null : option.value }))}
                            >
                              {option.icon} {option.label}
                            </button>
                        ))}
                      </div>
                    </div>
                )}

                {/* 영역: 저장 컬럼이 아직 없어 화면만 우선 구성 — category 컬럼 추가 후 연결 */}
                <div className="add-piece-field">
                  <label>영역</label>
                  <div className="add-piece-chip-row">
                    {categoryOptions.map((option) => (
                        <button
                            type="button"
                            key={option.value}
                            className={`add-piece-chip ${form.category === option.value ? 'active' : ''}`}
                            onClick={() => setForm((prev) => ({ ...prev, category: prev.category === option.value ? null : option.value }))}
                        >
                          {option.icon} {option.label}
                        </button>
                    ))}
                  </div>
                </div>

                <button
                    type="button"
                    className="add-piece-collapse-toggle"
                    onClick={() => setMemoSectionOpen((open) => !open)}
                    aria-expanded={memoSectionOpen}
                >
                  {memoSectionOpen ? <ChevronUp size={14} /> : <Plus size={14} />} 메모 추가
                </button>

                {memoSectionOpen && (
                    <textarea
                        className="add-piece-memo"
                        rows="2"
                        placeholder="필요한 메모를 입력하세요."
                        value={form.memo}
                        onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                        maxLength={200}
                    />
                )}

                {showTimeSection && (
                    <>
                      <button
                          type="button"
                          className="add-piece-collapse-toggle"
                          onClick={() => {
                            setTimeSectionOpen((open) => {
                              const nextOpen = !open;
                              if (nextOpen && !selectedStart) {
                                const defaultStart = '09:00';
                                const minutes = form.estimatedMinutes || 30;
                                setSelectedStart(defaultStart);
                                setEndMode('DURATION');
                                setForm((prev) => ({
                                  ...prev,
                                  estimatedMinutes: minutes,
                                  startTime: defaultStart,
                                  endTime: toTime(toMinutes(defaultStart) + minutes),
                                }));
                              }
                              return nextOpen;
                            });
                          }}
                          aria-expanded={timeSectionOpen}
                      >
                        {timeSectionOpen ? <ChevronUp size={14} /> : <Plus size={14} />} 시간 정하기
                      </button>

                      {timeSectionOpen && (
                          <div className="add-piece-time-section">
                            <div className="add-piece-time-row">
                              <label htmlFor="add-piece-start-time">시작</label>
                              <div className="add-piece-time-input-wrap">
                                <Clock size={14} className="add-piece-time-icon" />
                                <input
                                    id="add-piece-start-time"
                                    className="input add-piece-time-input"
                                    type="time"
                                    value={selectedStart ?? ''}
                                    onChange={(event) => handleStartSelect(event.target.value)}
                                />
                              </div>
                              <div className="add-piece-endmode-toggle">
                                <button
                                    type="button"
                                    className={endMode === 'DURATION' ? 'active' : ''}
                                    onClick={() => handleEndModeChange('DURATION')}
                                >
                                  소요 시간으로 계산
                                </button>
                                <button
                                    type="button"
                                    className={endMode === 'DIRECT' ? 'active' : ''}
                                    onClick={() => handleEndModeChange('DIRECT')}
                                >
                                  종료 시간 직접 선택
                                </button>
                              </div>
                            </div>

                            {endMode === 'DURATION' ? (
                                <p className="add-piece-duration-note">
                                  예상 시간 <strong>{formatMinutesLabel(form.estimatedMinutes) || '30분'}</strong> 기준으로 종료 시간을 자동 계산해요.
                                  {' '}예상 시간을 바꾸려면 위 <em>예상 시간</em>에서 다시 선택하세요.
                                </p>
                            ) : (
                                <div className="add-piece-time-row add-piece-direct-end-row">
                                  <label htmlFor="add-piece-end-time">종료 시간</label>
                                  <div className="add-piece-time-input-wrap">
                                    <Clock size={14} className="add-piece-time-icon" />
                                    <input
                                        id="add-piece-end-time"
                                        className="input add-piece-time-input"
                                        type="time"
                                        value={formatTime(form.endTime) || ''}
                                        onChange={(event) => handleEndTimeSelect(event.target.value)}
                                    />
                                  </div>
                                </div>
                            )}

                            <div className="add-piece-time-preview-row">
                              <span className="add-piece-time-preview-label">미리보기</span>
                              <span className="add-piece-time-preview-value">
                        {timeLabel || '시간을 선택하면 여기 표시돼요'}
                      </span>
                              {timeLabel && (
                                  <button type="button" className="add-piece-time-clear" onClick={clearTime}>
                                    시간 해제
                                  </button>
                              )}
                            </div>
                          </div>
                      )}
                    </>
                )}

                <div className="add-piece-footer">
                  <button type="button" className="btn-ghost" onClick={resetForm}>취소</button>
                  <button
                      type="button"
                      className="btn-primary"
                      onClick={handleCreate}
                      disabled={!form.title.trim() || submitting}
                  >
                    {submitting ? '추가 중...' : '추가하기'}
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* ── AI 패널 ── */}
        {aiPanelOpen && (
            <AiPanel
                pastItems={pastItems}
                getItemTitle={getItemTitle}
                onClose={() => setAiPanelOpen(false)}
                onAddToToday={async (suggestion) => {
                  await createBlock({ title: suggestion.title, priority: suggestion.priority });
                  await fetchItems();
                }}
                onEditThenAdd={(suggestion) => {
                  setForm((prev) => ({ ...prev, title: suggestion.title, priority: suggestion.priority }));
                  setAiPanelOpen(false);
                }}
            />
        )}

        {/* ── 작게 줄이기 모달 ── */}
        {reduceTarget && (
            <div className="today-modal-backdrop">
              <form
                  className="today-reduce-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="today-reduce-title"
                  onSubmit={handleReduceSubmit}
              >
                <div className="today-reduce-header">
                  <div>
                    <h2 id="today-reduce-title">목표 작게 줄이기</h2>
                    <p>포기하는 대신, 지금 할 수 있는 만큼만 가볍게 조정해 보세요.</p>
                  </div>
                </div>

                <div className="today-reduce-original">
                  <span>원래 항목</span>
                  <div>{getItemTitle(reduceTarget)}</div>
                </div>

                <div className="today-reduce-field">
                  <label htmlFor="today-reduce-title-input">할 일 이름 줄이기</label>
                  <input
                      id="today-reduce-title-input"
                      type="text"
                      value={reduceForm.reducedTitle}
                      onChange={(event) => setReduceForm((prev) => ({ ...prev, reducedTitle: event.target.value }))}
                      placeholder="예: 알고리즘 1문제 풀기"
                      autoFocus
                  />
                  <p>예시: '알고리즘 1문제 풀기', '개발 책 5페이지 읽기'</p>
                </div>

                <div className="today-reduce-time-section">
                  <div className="today-reduce-section-title">시간도 함께 줄이시겠어요? (선택)</div>
                  <div className="today-reduce-current-time">기존 시간: {reduceExistingTime}</div>

                  <div className="today-reduce-time-options">
                    <label className="today-reduce-radio-row">
                      <input
                          type="radio"
                          name="today-reduce-time-mode"
                          value="KEEP"
                          checked={reduceForm.timeMode === 'KEEP'}
                          onChange={() => setReduceForm((prev) => ({ ...prev, timeMode: 'KEEP' }))}
                      />
                      <span>그대로 유지</span>
                    </label>

                    <label className={`today-reduce-radio-row ${!reduceTargetHasTime ? 'disabled' : ''}`}>
                      <input
                          type="radio"
                          name="today-reduce-time-mode"
                          value="SHRINK"
                          checked={reduceForm.timeMode === 'SHRINK'}
                          onChange={() => setReduceForm((prev) => ({ ...prev, timeMode: 'SHRINK' }))}
                          disabled={!reduceTargetHasTime}
                      />
                      <span>시간 축소</span>
                    </label>

                    {reduceForm.timeMode === 'SHRINK' && reduceTargetHasTime && (
                        <div className="today-reduce-time-inputs">
                          <label>
                            <span>시작</span>
                            <input
                                type="time"
                                value={reduceForm.startTime}
                                onChange={(event) => setReduceForm((prev) => ({ ...prev, startTime: event.target.value }))}
                            />
                          </label>
                          <label>
                            <span>끝</span>
                            <input
                                type="time"
                                value={reduceForm.endTime}
                                onChange={(event) => setReduceForm((prev) => ({ ...prev, endTime: event.target.value }))}
                            />
                          </label>
                        </div>
                    )}

                    <label className={`today-reduce-radio-row ${!reduceTargetHasTime ? 'disabled' : ''}`}>
                      <input
                          type="radio"
                          name="today-reduce-time-mode"
                          value="CLEAR"
                          checked={reduceForm.timeMode === 'CLEAR'}
                          onChange={() => setReduceForm((prev) => ({ ...prev, timeMode: 'CLEAR' }))}
                          disabled={!reduceTargetHasTime}
                      />
                      <span>시간 해제 (오늘 중 언제든 할 수 있게 바꾸기)</span>
                    </label>
                  </div>
                </div>

                <div className="today-reduce-field">
                  <label htmlFor="today-reduce-memo">메모 (선택)</label>
                  <textarea
                      id="today-reduce-memo"
                      value={reduceForm.memo}
                      onChange={(event) => setReduceForm((prev) => ({ ...prev, memo: event.target.value }))}
                      placeholder="줄이는 이유나 참고할 내용을 짧게 적어보세요."
                      rows="2"
                  />
                </div>

                {reduceError && <div className="today-reduce-error">{reduceError}</div>}

                <div className="today-reduce-actions">
                  <button type="button" className="btn-ghost" onClick={closeReduceModal} disabled={isReduceSubmitting}>
                    취소
                  </button>
                  <button type="submit" className="btn-primary" disabled={isReduceSubmitting}>
                    {isReduceSubmitting ? '조정 중...' : '조정 완료'}
                  </button>
                </div>
              </form>
            </div>
        )}
      </div>
  );
}

/* ===================== AI 패널 ===================== */
/*
 * 지금은 로컬 규칙 기반 스텁이다.
 * 추후 ai_suggestions API가 생기면 generateSuggestions만 API 호출로 교체한다.
 */

/* ===================== 한눈에 (조정/컨디션 분석) ===================== */
/*
 * 전량 mock 데이터다. plan_item_events 집계 API, quick_logs 집계 API가 생기면
 * 아래 MOCK_* 상수 자리를 실제 fetch 결과로 교체한다.
 * - 학기 개념은 도입하지 않는다. 기간(최근 N일) 기준으로만 동작한다.
 * - "영향도(높음/중간)" 같은 확신 등급은 표기하지 않는다. 근거가 약할 때는
 *   "관련 기록 N건"처럼 사실만 보여준다.
 * - "이행률/미완료" 계열 단어 대신 조정 중심 언어를 쓴다.
 */

const OVERVIEW_PERIOD_OPTIONS = [
  { value: 30, label: '최근 30일' },
  { value: 60, label: '최근 60일' },
  { value: 90, label: '최근 90일' },
];

const MOCK_PATTERNS = [
  {
    key: 'sleep-focus',
    icon: Moon,
    title: '수면 부족 → 집중력 저하',
    desc: '수면 기록이 적었던 날, 오늘의 핵심 항목을 보류하거나 줄인 비율이 함께 높았어요.',
    relatedCount: 23,
  },
  {
    key: 'deadline-plan',
    icon: Timer,
    title: '마감 전날 → 계획을 많이 조정함',
    desc: '마감 전날에는 평소보다 항목을 이동하거나 줄이는 조정이 더 자주 있었어요.',
    relatedCount: 18,
  },
  {
    key: 'stress-note',
    icon: RotateCcw,
    title: '컨디션이 낮았던 날 → 보류가 늘어남',
    desc: '컨디션을 낮게 기록한 날 이후로 보류 항목이 이어지는 경향이 보여요.',
    relatedCount: 15,
  },
];

const MOCK_CONDITION_TREND = [2, 3, 2, 1, 2, 3, 3, 2, 1, 2, 3, 2];

const MOCK_TAG_COUNTS = [
  { key: 'lackSleep', label: '수면 부족', count: 18 },
  { key: 'beforeExam', label: '시험/마감 전날', count: 12 },
  { key: 'afterWork', label: '알바 다음날', count: 11 },
  { key: 'goodCondition', label: '컨디션 좋음', count: 6 },
];

const MOCK_ADJUSTMENT_SUMMARY = { moved: 24, reduced: 12, held: 5 };

const MOCK_ADJUSTMENT_LOG = [
  { key: 1, title: '알고리즘 과제 이해하기', type: 'moved', detail: '6/12(목) → 6/13(금)' },
  { key: 2, title: '자료구조 복습 1h', type: 'reduced', detail: '1h → 30분' },
  { key: 3, title: '영어 단어 20개 암기', type: 'held', detail: '보류함' },
];

const MOCK_SEMESTER_EVENTS = [
  { key: 1, date: '3/10', label: '중간고사', tag: '시험' },
  { key: 2, date: '4/25', label: '팀 프로젝트 시작', tag: '프로젝트' },
  { key: 3, date: '5/15', label: '과제 몰림 구간', tag: '과제' },
  { key: 4, date: '6/10', label: '기말고사', tag: '시험' },
];

const MOCK_WEEKLY_ROWS = ['월', '화', '수', '목', '금', '토', '일'];
const MOCK_WEEKLY_WEEKS = 10;
// 0: 기록 없음, 1: 기록이 잘 된 날, 2: 조정한 날, 3: 조정이 많았던 날
const MOCK_WEEKLY_CELLS = Array.from({ length: MOCK_WEEKLY_WEEKS * 7 }, (_, i) => {
  const pattern = [1, 1, 2, 1, 1, 3, 0];
  return pattern[i % 7] === 0 && i % 11 === 0 ? 0 : pattern[i % 7];
});

const ADJUSTMENT_TYPE_META = {
  moved: { label: '이동', icon: ArrowUpRight, className: 'adj-moved' },
  reduced: { label: '줄이기', icon: ArrowDownRight, className: 'adj-reduced' },
  held: { label: '보류', icon: PauseCircle, className: 'adj-held' },
};

function OverviewView({ onGoToday }) {
  const [period, setPeriod] = useState(90);
  const [filterOpen, setFilterOpen] = useState(false);

  // 실제 연동 전까지는 항상 mock 데이터를 사용한다.
  const recordedDays = 68;
  const recordedRatio = Math.round((recordedDays / period) * 100);
  const hasEnoughData = recordedDays > 0;

  const totalAdjustments = MOCK_ADJUSTMENT_SUMMARY.moved + MOCK_ADJUSTMENT_SUMMARY.reduced + MOCK_ADJUSTMENT_SUMMARY.held;

  const chartWidth = 560;
  const chartHeight = 120;
  const chartPoints = MOCK_CONDITION_TREND.map((value, index) => {
    const x = (index / (MOCK_CONDITION_TREND.length - 1)) * chartWidth;
    const y = chartHeight - ((value - 1) / 2) * (chartHeight - 16) - 8;
    return `${x},${y}`;
  }).join(' ');

  const weeklyCellClass = (value) => {
    if (value === 1) return 'cell-good';
    if (value === 2) return 'cell-adjusted';
    if (value === 3) return 'cell-adjusted-heavy';
    return 'cell-empty';
  };

  return (
      <div className="overview-view">
        <div className="overview-header">
          <div>
            <h1 className="overview-title">학기 한눈에</h1>
            <p className="overview-sub">이번 학기를 기록으로 돌아보고, 패턴을 이해하고, 다음 행동을 조정해요.</p>
          </div>
          <div className="overview-header-actions">
            <div className="overview-filter-wrap">
              <button type="button" className="overview-filter-btn" onClick={() => setFilterOpen((open) => !open)}>
                <SlidersHorizontal size={14} /> 필터
              </button>
              {filterOpen && (
                  <div className="overview-filter-dropdown">
                    <p>추후 태그·과목별 필터가 여기 추가될 예정이에요.</p>
                  </div>
              )}
            </div>
            {/* 학기 도메인 API가 생기기 전까지는 표시용 라벨 + 기간 토글을 함께 둔다 */}
            <button type="button" className="overview-semester-btn">
              <CalendarDays size={14} /> 2026년 1학기 (현재)
            </button>
            <div className="overview-period-select">
              {OVERVIEW_PERIOD_OPTIONS.map((option) => (
                  <button
                      type="button"
                      key={option.value}
                      className={period === option.value ? 'active' : ''}
                      onClick={() => setPeriod(option.value)}
                  >
                    {option.label}
                  </button>
              ))}
            </div>
          </div>
        </div>

        {!hasEnoughData ? (
            <div className="overview-empty-state">
              <div className="today-empty-icon">🌤️</div>
              <p>아직 쌓인 기록이 많지 않아요.</p>
              <p>오늘 화면에서 몇 번만 기록해보면 여기서 패턴을 보여드려요.</p>
            </div>
        ) : (
            <>
              <div className="overview-stat-row">
                <div className="overview-stat-card">
                  <div className="overview-stat-label"><CalendarDays size={14} /> 기록한 날</div>
                  <div className="overview-stat-main">
                    <span className="overview-stat-value">{recordedDays}일</span>
                    <div className="overview-ring" style={{ '--ring-pct': `${recordedRatio}%` }}>
                      <span>{recordedRatio}%</span>
                    </div>
                  </div>
                  <div className="overview-stat-sub">최근 {period}일 중</div>
                </div>

                <div className="overview-stat-card">
                  <div className="overview-stat-label"><RotateCcw size={14} /> 조정한 계획</div>
                  <div className="overview-stat-value">{totalAdjustments}건</div>
                  <div className="overview-stat-sub">
                    이동 {MOCK_ADJUSTMENT_SUMMARY.moved} · 줄이기 {MOCK_ADJUSTMENT_SUMMARY.reduced} · 보류 {MOCK_ADJUSTMENT_SUMMARY.held}
                  </div>
                </div>

                <div className="overview-stat-card">
                  <div className="overview-stat-label">😊 평균 컨디션</div>
                  <div className="overview-stat-value">보통</div>
                  <div className="overview-stat-sub">2.3 / 3</div>
                </div>

                <div className="overview-stat-card">
                  <div className="overview-stat-label">🔁 반복되는 상황</div>
                  <div className="overview-stat-value">{MOCK_PATTERNS.length}개</div>
                  <div className="overview-stat-sub">아래에서 확인해보세요</div>
                </div>

                <div className="overview-stat-card overview-memo-card">
                  <div className="overview-stat-label">이번 기간 메모</div>
                  <p>기록이 쌓일수록 내 패턴이 보이기 시작해요.</p>
                  <button type="button" className="overview-memo-btn">메모 작성</button>
                </div>
              </div>

              <div className="overview-grid">
                <section className="overview-card">
                  <div className="overview-card-title">반복되는 패턴</div>
                  <div className="overview-pattern-list">
                    {MOCK_PATTERNS.map((pattern) => {
                      const PatternIcon = pattern.icon;
                      return (
                          <div key={pattern.key} className="overview-pattern-row">
                            <span className="overview-pattern-icon"><PatternIcon size={16} /></span>
                            <div>
                              <div className="overview-pattern-title">{pattern.title}</div>
                              <p className="overview-pattern-desc">{pattern.desc}</p>
                              <span className="overview-pattern-count">관련 기록 {pattern.relatedCount}건</span>
                            </div>
                          </div>
                      );
                    })}
                  </div>
                </section>

                <section className="overview-card">
                  <div className="overview-card-title">컨디션 흐름</div>
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overview-chart" preserveAspectRatio="none">
                    <polyline points={chartPoints} className="overview-chart-line" fill="none" />
                  </svg>
                  <div className="overview-chart-legend">
                    <span><i className="dot dot-good" /> 좋음 21%</span>
                    <span><i className="dot dot-mid" /> 보통 49%</span>
                    <span><i className="dot dot-bad" /> 나쁨 30%</span>
                  </div>

                  <div className="overview-tag-section">
                    <div className="overview-tag-title">자주 등장한 상황 태그</div>
                    <div className="overview-tag-chips">
                      {MOCK_TAG_COUNTS.map((tag) => (
                          <span key={tag.key} className="overview-tag-chip">{tag.label} {tag.count}회</span>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="overview-card">
                  <div className="overview-card-title">이번 기간 패턴 요약</div>
                  <div className="overview-summary-row">
                    <span className="overview-summary-icon good">👍</span>
                    <div>
                      <div className="overview-summary-title">눈에 띄는 흐름</div>
                      <p>주간 리듬이 일정했던 주에는 조정 횟수가 적었어요.</p>
                    </div>
                  </div>
                  <div className="overview-summary-row">
                    <span className="overview-summary-icon warn">🎯</span>
                    <div>
                      <div className="overview-summary-title">살펴볼 점</div>
                      <p>수면 기록과 컨디션이 함께 낮아지는 날이 반복됐어요.</p>
                    </div>
                  </div>
                  <div className="overview-summary-row">
                    <span className="overview-summary-icon grow">🌱</span>
                    <div>
                      <div className="overview-summary-title">앞으로 가져갈 것</div>
                      <p>일찍 시작한 계획일수록 끝까지 이어지는 경향이 있었어요.</p>
                    </div>
                  </div>
                </section>
              </div>

              <div className="overview-grid overview-grid-3">
                <section className="overview-card overview-heatmap-card">
                  <div className="overview-card-title">주간 리듬 한눈에</div>
                  <div className="overview-heatmap" style={{ '--weeks': MOCK_WEEKLY_WEEKS }}>
                    {MOCK_WEEKLY_ROWS.map((rowLabel, rowIndex) => (
                        <div key={rowLabel} className="overview-heatmap-row">
                          <span className="overview-heatmap-row-label">{rowLabel}</span>
                          {Array.from({ length: MOCK_WEEKLY_WEEKS }, (_, weekIndex) => {
                            const value = MOCK_WEEKLY_CELLS[weekIndex * 7 + rowIndex];
                            return <span key={weekIndex} className={`overview-heatmap-cell ${weeklyCellClass(value)}`} />;
                          })}
                        </div>
                    ))}
                  </div>
                  <div className="overview-heatmap-legend">
                    <span><i className="dot cell-good" /> 기록이 잘 된 날</span>
                    <span><i className="dot cell-adjusted" /> 조정한 날</span>
                    <span><i className="dot cell-adjusted-heavy" /> 조정이 많았던 날</span>
                    <span><i className="dot cell-empty" /> 기록 없음</span>
                  </div>
                </section>

                <section className="overview-card">
                  <div className="overview-card-title">조정 이력 요약</div>
                  <div className="overview-adjustment-summary">
                    {Object.entries(ADJUSTMENT_TYPE_META).map(([type, meta]) => {
                      const TypeIcon = meta.icon;
                      return (
                          <div key={type} className={`overview-adjustment-chip ${meta.className}`}>
                            <TypeIcon size={13} /> {meta.label} {MOCK_ADJUSTMENT_SUMMARY[type === 'moved' ? 'moved' : type === 'reduced' ? 'reduced' : 'held']}건
                          </div>
                      );
                    })}
                  </div>
                  <div className="overview-adjustment-log">
                    {MOCK_ADJUSTMENT_LOG.map((log) => {
                      const meta = ADJUSTMENT_TYPE_META[log.type];
                      const LogIcon = meta.icon;
                      return (
                          <div key={log.key} className="overview-adjustment-row">
                            <span className={`overview-adjustment-icon ${meta.className}`}><LogIcon size={13} /></span>
                            <span className="overview-adjustment-title">{log.title}</span>
                            <span className="overview-adjustment-detail">{log.detail}</span>
                          </div>
                      );
                    })}
                  </div>
                  <button type="button" className="overview-more-link">전체 조정 이력 보기 →</button>
                </section>

                <section className="overview-card">
                  <div className="overview-card-title">이번 학기 주요 이벤트</div>
                  <div className="overview-timeline">
                    {MOCK_SEMESTER_EVENTS.map((event) => (
                        <div key={event.key} className="overview-timeline-row">
                          <span className="overview-timeline-dot" />
                          <span className="overview-timeline-date">{event.date}</span>
                          <span className="overview-timeline-label">{event.label}</span>
                          <span className="overview-timeline-tag">{event.tag}</span>
                        </div>
                    ))}
                  </div>
                  <button type="button" className="overview-more-link">타임라인 전체 보기 →</button>
                </section>
              </div>

              <div className="overview-cta-banner">
                <div>
                  <div className="overview-cta-title">지금의 작은 조정이, 앞으로의 여유를 만들어요.</div>
                  <p>패턴을 이해하면, 더 나은 선택을 할 수 있어요.</p>
                </div>
                <button type="button" className="btn-primary overview-cta-btn" onClick={onGoToday}>
                  발견한 패턴을 오늘 계획으로 연결하기 →
                </button>
              </div>
            </>
        )}
      </div>
  );
}

const AI_MOOD_CHIPS = [
  { key: 'light', label: '가볍게', icon: '🌱' },
  { key: 'normal', label: '보통으로', icon: '🙂' },
  { key: 'focused', label: '집중해서', icon: '🎯' },
];

const AI_TAG_CHIPS = [
  { key: 'tired', label: '피곤함', icon: '🌙' },
  { key: 'shortTime', label: '시간 적음', icon: '⏱️' },
  { key: 'cleanup', label: '지난 계획 정리', icon: '📁' },
];

const AI_TEMPLATES = {
  light: [
    { title: '책상 위 정리하기', priority: 'OPTIONAL' },
    { title: '10분 산책하기', priority: 'OPTIONAL' },
    { title: '물 한 잔 마시고 스트레칭', priority: 'OPTIONAL' },
    { title: '메모장에 떠오르는 생각 3줄 적기', priority: 'SHOULD' },
  ],
  normal: [
    { title: '오늘 가장 중요한 일 하나 정하기', priority: 'MUST' },
    { title: '어제 하던 일 30분 이어서 하기', priority: 'SHOULD' },
    { title: '내일 일정 미리 훑어보기', priority: 'OPTIONAL' },
    { title: '밀린 메시지/메일 답장하기', priority: 'SHOULD' },
  ],
  focused: [
    { title: '가장 어려운 일 1시간 집중하기', priority: 'MUST' },
    { title: '방해 없는 환경 만들고 딥워크', priority: 'MUST' },
    { title: '끝내지 못한 핵심 작업 마무리하기', priority: 'MUST' },
    { title: '집중 후 10분 휴식 계획하기', priority: 'OPTIONAL' },
  ],
  tired: [
    { title: '오늘은 딱 하나만 하기', priority: 'MUST' },
    { title: '일찍 자기 위한 준비 시작하기', priority: 'SHOULD' },
    { title: '가벼운 스트레칭 5분', priority: 'OPTIONAL' },
  ],
  shortTime: [
    { title: '15분 안에 끝나는 일 하나 처리하기', priority: 'SHOULD' },
    { title: '내일의 나를 위한 준비 딱 하나', priority: 'SHOULD' },
    { title: '핵심만 빠르게 확인하기', priority: 'MUST' },
  ],
};

function shrinkTitle(title) {
  return `${title} 조금만 해보기`;
}

function AiPanel({ pastItems, getItemTitle, onClose, onAddToToday, onEditThenAdd }) {
  const [mood, setMood] = useState('normal');
  const [tags, setTags] = useState(() => new Set());
  const [note, setNote] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [generated, setGenerated] = useState(false);
  const [seed, setSeed] = useState(0);
  const [addingKeys, setAddingKeys] = useState(() => new Set());
  const [addedKeys, setAddedKeys] = useState(() => new Set());

  const toggleTag = (key) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const generateSuggestions = (nextSeed = seed) => {
    const pool = [];

    // 지난 계획 정리를 골랐거나 pending이 있으면 작게 줄인 버전을 우선 추천
    if (tags.has('cleanup') && pastItems.length > 0) {
      pastItems.slice(0, 2).forEach((item) => {
        pool.push({ title: shrinkTitle(getItemTitle(item)), priority: 'SHOULD' });
      });
    }

    tags.forEach((tag) => {
      if (AI_TEMPLATES[tag]) pool.push(...AI_TEMPLATES[tag]);
    });
    pool.push(...(AI_TEMPLATES[mood] ?? AI_TEMPLATES.normal));

    // note에 키워드가 있으면 첫 추천으로 살짝 반영
    const trimmedNote = note.trim();
    if (trimmedNote) {
      pool.unshift({ title: `${trimmedNote} — 조금이라도 해보기`, priority: 'SHOULD' });
    }

    // 중복 제거 후 seed 기준으로 2~3개 회전
    const unique = [];
    const seen = new Set();
    pool.forEach((suggestion) => {
      if (!seen.has(suggestion.title)) {
        seen.add(suggestion.title);
        unique.push(suggestion);
      }
    });

    const count = Math.min(3, unique.length);
    const rotated = unique.slice(nextSeed % Math.max(unique.length, 1)).concat(unique).slice(0, count);
    setSuggestions(rotated);
    setGenerated(true);
  };

  const handleMore = () => {
    const nextSeed = seed + 3;
    setSeed(nextSeed);
    generateSuggestions(nextSeed);
  };

  const priorityBadge = {
    MUST: { label: '🎯 오늘의 핵심', className: 'priority-must' },
    SHOULD: { label: '🌱 하면 좋은 것', className: 'priority-should' },
    OPTIONAL: { label: '☕ 여유 있으면', className: 'priority-optional' },
  };

  const suggestionIcon = { MUST: '🎯', SHOULD: '🌱', OPTIONAL: '☕' };

  const handleAdd = async (suggestion) => {
    if (addingKeys.has(suggestion.title) || addedKeys.has(suggestion.title)) return;
    setAddingKeys((prev) => new Set(prev).add(suggestion.title));
    try {
      await onAddToToday(suggestion);
      setAddedKeys((prev) => new Set(prev).add(suggestion.title));
    } catch {
      // 실패 시 다시 시도할 수 있게 둔다.
    } finally {
      setAddingKeys((prev) => {
        const next = new Set(prev);
        next.delete(suggestion.title);
        return next;
      });
    }
  };

  return (
      <aside className="ai-panel" role="dialog" aria-label="AI로 오늘 정하기">
        <div className="ai-panel-header">
          <h2><Sparkles size={16} /> AI로 오늘 정하기</h2>
          <button type="button" className="ai-close-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>
        <p className="ai-panel-desc">오늘 상황을 알려주면, 오늘 해볼 만한 일을 추천해드려요.</p>

        <div className="ai-section-title">오늘 상황 선택</div>
        <div className="ai-chip-group">
          {AI_MOOD_CHIPS.map((chip) => (
              <button
                  type="button"
                  key={chip.key}
                  className={`ai-chip ${mood === chip.key ? 'active' : ''}`}
                  onClick={() => setMood(chip.key)}
                  aria-pressed={mood === chip.key}
              >
                <span>{chip.icon}</span> {chip.label}
              </button>
          ))}
          {AI_TAG_CHIPS.map((chip) => (
              <button
                  type="button"
                  key={chip.key}
                  className={`ai-chip ${tags.has(chip.key) ? 'active' : ''}`}
                  onClick={() => toggleTag(chip.key)}
                  aria-pressed={tags.has(chip.key)}
              >
                <span>{chip.icon}</span> {chip.label}
              </button>
          ))}
        </div>

        <div className="ai-section-title">추가로 적어보세요 (선택)</div>
        <textarea
            className="ai-note"
            rows="3"
            placeholder={'예: 시간이 별로 없고 README를\n조금이라도 정리하고 싶어요.'}
            value={note}
            onChange={(event) => setNote(event.target.value)}
        />

        <button type="button" className="btn-primary ai-generate-btn" onClick={() => generateSuggestions()}>
          <Sparkles size={15} /> 추천 받기
        </button>

        {generated && (
            <>
              <div className="ai-result-header">
                <span className="ai-section-title">추천 결과</span>
                <span className="ai-result-hint">2~3개 추천해드려요</span>
              </div>

              <div className="ai-result-list">
                {suggestions.map((suggestion) => {
                  const badge = priorityBadge[suggestion.priority] ?? priorityBadge.SHOULD;
                  const isAdding = addingKeys.has(suggestion.title);
                  const isAdded = addedKeys.has(suggestion.title);
                  return (
                      <div key={suggestion.title} className="ai-result-card">
                        <div className="ai-result-main">
                          <span className="ai-result-icon">{suggestionIcon[suggestion.priority] ?? '🌱'}</span>
                          <div>
                            <div className="ai-result-title">{suggestion.title}</div>
                            <span className={`today-row-badge ${badge.className}`}>{badge.label}</span>
                          </div>
                        </div>
                        <div className="ai-result-actions">
                          <button
                              type="button"
                              className="ai-result-btn primary"
                              onClick={() => handleAdd(suggestion)}
                              disabled={isAdding || isAdded}
                          >
                            {isAdded ? '추가됨 ✓' : isAdding ? '추가 중...' : '오늘에 추가'}
                          </button>
                          <button
                              type="button"
                              className="ai-result-btn"
                              onClick={() => onEditThenAdd(suggestion)}
                              disabled={isAdding}
                          >
                            수정해서 추가
                          </button>
                        </div>
                      </div>
                  );
                })}
              </div>

              <button type="button" className="ai-more-btn" onClick={handleMore}>
                다른 추천 보기 <ChevronDown size={14} />
              </button>
            </>
        )}
      </aside>
  );
}

export default App;