import { useEffect, useState } from 'react';
import './App.css';

import { authAPI, diaryAPI, scheduleBlockAPI } from './api/api';
import DiaryListView from './DiaryListView';
import DiaryEditorView from './DiaryEditorView';
import StatisticsView from './StatisticsView';

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
        setCurrentView('diary');
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
      setCurrentView('diary');
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
      setCurrentView('diary');
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
      {currentView === 'diary' && user && (
        <DiaryView user={user} onLogout={handleLogout} />
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
          <div className="auth-logo-icon">📔</div>
          <h1>Prismatic Diary</h1>
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

function DiaryView({ user, onLogout }) {
  const [currentTab, setCurrentTab] = useState('list');
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
    setCurrentTab('list');
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
    if (currentTab === 'list') loadDiaries(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, filter]);

  const tabs = [
    { key: 'list', label: '📚 일기 목록' },
    { key: 'editor', label: '✍️ 새 일기 작성' },
    { key: 'statistics', label: '📊 통계' },
    { key: 'today', label: '📝 오늘 해볼 것' },
  ];

  const nickname = user?.nickname || user?.name || user?.email?.split('@')[0] || '사용자';

  return (
    <>
      <div className="nav-bar">
        <div className="nav-inner">
          <div className="nav-logo">
            <div className="nav-logo-icon">📔</div>
            <span>Prismatic Diary</span>
          </div>

          <nav className="tab-nav">
            {tabs.map(({ key, label }) => (
              <button
                type="button"
                key={key}
                className={currentTab === key ? 'active' : ''}
                onClick={() => {
                  if (key === 'editor') setEditingDiary(null);
                  setCurrentTab(key);
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="nav-user">
            <div className="nav-avatar">{nickname[0].toUpperCase()}</div>
            <span className="nav-name">{nickname}님</span>
            <button type="button" className="nav-logout" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </div>
      </div>

      <div className="diary-container">
        {currentTab === 'list' && (
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
            onEdit={(diary) => { setEditingDiary(diary); setCurrentTab('editor'); }}
            onDelete={handleDelete}
            onToggleFavorite={handleToggleFavorite}
            loading={loading}
          />
        )}
        {currentTab === 'editor' && (
          <DiaryEditorView
            diary={editingDiary}
            onSave={handleDiarySaved}
            onCancel={() => setCurrentTab('list')}
          />
        )}
        {currentTab === 'statistics' && <StatisticsView />}
        {currentTab === 'today' && <TodayView />}
      </div>
    </>
  );
}

function TodayView() {
  const today = scheduleBlockAPI.getTodayString();
  const emptyForm = { title: '', priority: 'SHOULD', startTime: null, endTime: null, memo: '' };

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingItemIds, setPendingItemIds] = useState(() => new Set());
  const [form, setForm] = useState(emptyForm);
  const [timePanelOpen, setTimePanelOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [selectedStart, setSelectedStart] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [customTimeOpen, setCustomTimeOpen] = useState(false);

  const priorityOptions = [
    { value: 'MUST', label: '🎯 오늘의 핵심' },
    { value: 'SHOULD', label: '🌱 하면 좋은 것' },
    { value: 'OPTIONAL', label: '☕ 여유 있으면' },
  ];

  const startOptions = [
    { label: '오전 9시', value: '09:00' },
    { label: '오전 10시', value: '10:00' },
    { label: '오후 2시', value: '14:00' },
    { label: '오후 6시', value: '18:00' },
    { label: '오후 8시', value: '20:00' },
    { label: '오후 10시', value: '22:00' },
  ];

  const durationOptions = [
    { label: '30분', value: 30 },
    { label: '1시간', value: 60 },
    { label: '2시간', value: 120 },
  ];

  const formatDateKo = (dateString) => {
    const date = new Date(`${dateString}T00:00:00`);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${days[date.getDay()]}요일`;
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

  const applyTime = (start = selectedStart, duration = selectedDuration) => {
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
    setSelectedDuration(60);
    setTimePanelOpen(false);
    setCustomTimeOpen(false);
    setMemoOpen(false);
  };

  const getItemId = (item) => item.scheduleBlockId ?? item.schedule_block_id ?? item.id;
  const getItemTitle = (item) => item.title ?? item.name ?? '제목 없음';
  const getItemMemo = (item) => item.memo ?? item.content;
  const getItemStatus = (item) => item.status ?? 'PLANNED';
  const getItemStart = (item) => item.startTime ?? item.start_time;
  const getItemEnd = (item) => item.endTime ?? item.end_time;
  const getPendingKey = (itemId) => String(itemId);

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

  const fetchItems = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await scheduleBlockAPI.getByDate(today);
      setItems(Array.isArray(data) ? data : data?.content ?? []);
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
    applyTime(start, selectedDuration);
  };

  const handleDurationSelect = (duration) => {
    setSelectedDuration(duration);
    if (selectedStart) applyTime(selectedStart, duration);
  };

  const handleCreate = async () => {
    const title = form.title.trim();
    if (!title || submitting) return;

    const hasTime = Boolean(form.startTime && form.endTime);
    const memo = form.memo.trim();

    setSubmitting(true);
    setError('');

    try {
      await scheduleBlockAPI.create({
        blockDate: today,
        title,
        priority: form.priority,
        blockType: hasTime ? 'TIME_FIXED' : 'TASK',
        startTime: hasTime ? toScheduleDateTime(form.startTime) : null,
        endTime: hasTime ? toScheduleDateTime(form.endTime) : null,
        memo: memo || null,
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
    const afterTitle = window.prompt('작게 줄인 제목을 입력해주세요.', currentTitle);
    if (afterTitle === null) return;

    const trimmedTitle = afterTitle.trim();
    if (!trimmedTitle || trimmedTitle === currentTitle.trim()) return;

    runItemAction(item, (itemId) => scheduleBlockAPI.reduce(itemId, trimmedTitle, null));
  };

  const handleHold = (item) => {
    if (!confirm('이 항목을 보류할까요?')) return;
    runItemAction(item, (itemId) => scheduleBlockAPI.hold(itemId, null));
  };

  const toggleActionMenu = (itemId) => {
    const menuId = getPendingKey(itemId);
    setOpenActionMenuId((currentId) => (currentId === menuId ? null : menuId));
  };

  const renderActionMenu = (item, isPending) => {
    const itemId = getItemId(item);
    const menuId = getPendingKey(itemId);
    const isOpen = openActionMenuId === menuId;

    return (
      <div className="today-item-menu-wrap">
        <button
          className="today-more-button"
          type="button"
          onClick={() => toggleActionMenu(itemId)}
          disabled={isPending || !itemId}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label="더보기"
          title="더보기"
        >
          ⋯
        </button>
        {isOpen && (
          <div className="today-item-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => handleMoveTomorrow(item)} disabled={isPending}>
              내일로 이동
            </button>
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
    );
  };

  const renderDeleteButton = (item, isPending) => {
    const itemId = getItemId(item);
    return (
      <button
        className="today-delete-button"
        type="button"
        onClick={() => handleDelete(item)}
        disabled={isPending || !itemId}
        title="삭제"
      >
        ×
      </button>
    );
  };

  const isAdjustableItem = (item) => {
    return getItemStatus(item) === 'PLANNED';
  };

  const getStatusLabel = (status) => {
    if (status === 'HOLD') return '보류됨';
    if (status === 'CANCELLED') return '취소됨';
    return '';
  };

  const doneCount = items.filter((item) => getItemStatus(item) === 'DONE').length;
  const totalCount = items.length;
  const activeItems = items.filter((item) => getItemStatus(item) !== 'DONE');
  const doneItems = items.filter((item) => getItemStatus(item) === 'DONE');
  const selectedPriority = priorityOptions.find((option) => option.value === form.priority);
  const timeLabel = formatTimeRange(form.startTime, form.endTime);

  return (
    <div className="today-view">
      <div className="today-header-card card">
        <div>
          <div className="today-date">{formatDateKo(today)}</div>
          <div className="today-sub">
            {totalCount === 0 ? '오늘 해볼 것을 가볍게 하나만 적어보세요.' : `${doneCount}개 완료 / ${totalCount}개`}
          </div>
        </div>
        <button className="today-ai-button" type="button" disabled title="다음 단계에서 연결 예정">
          AI로 오늘 정하기
        </button>
      </div>

      <div className="today-form-card card">
        <div className="today-form-heading">
          <div>
            <div className="today-form-title">오늘 해볼 것 추가</div>
            <p className="today-form-desc">일단 하나만 적고, 필요할 때 시간과 메모를 더해보세요.</p>
          </div>
        </div>

        <div className="today-create-form">
          <input
            className="input today-title-input"
            type="text"
            placeholder="오늘 해볼 것을 적어보세요. 예: 15:00 알바 가기"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            onKeyDown={handleTitleKeyDown}
          />

          <div className="today-priority-group" aria-label="우선순위 선택">
            {priorityOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={`today-priority-pill ${form.priority === option.value ? 'active' : ''}`}
                onClick={() => setForm({ ...form, priority: option.value })}
                aria-pressed={form.priority === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="today-action-row">
            <button
              type="button"
              className="today-memo-toggle"
              onClick={() => setMemoOpen((open) => !open)}
              aria-expanded={memoOpen}
            >
              {memoOpen ? '메모 닫기' : '+ 메모 추가'}
            </button>

            <button
              type="button"
              className={`today-time-button ${timeLabel ? 'selected' : ''}`}
              onClick={() => setTimePanelOpen((open) => !open)}
              aria-expanded={timePanelOpen}
            >
              {timeLabel ? (
                <>
                  <span>🕒 {timeLabel}</span>
                  <span
                    className="today-time-clear"
                    role="button"
                    tabIndex={0}
                    aria-label="시간 해제"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearTime();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        clearTime();
                      }
                    }}
                  >
                    ×
                  </span>
                </>
              ) : '🕒 시간 정하기'}
            </button>

            <button
              type="button"
              className="today-add-button btn-primary"
              onClick={handleCreate}
              disabled={!form.title.trim() || submitting}
            >
              {submitting ? '추가 중...' : '추가'}
            </button>
          </div>
        </div>

        {memoOpen && (
          <div className="today-memo-panel">
            <label htmlFor="today-memo">메모</label>
            <textarea
              id="today-memo"
              value={form.memo}
              onChange={(event) => setForm({ ...form, memo: event.target.value })}
              placeholder="필요한 내용만 짧게 남겨보세요."
              rows="3"
            />
          </div>
        )}

        {timePanelOpen && (
          <div className="today-time-panel">
            <div className="today-time-section">
              <div className="today-time-label">시작</div>
              <div className="today-time-options">
                {startOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`today-time-option ${selectedStart === option.value ? 'active' : ''}`}
                    onClick={() => handleStartSelect(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`today-time-option custom ${customTimeOpen ? 'active' : ''}`}
                  onClick={() => setCustomTimeOpen((open) => !open)}
                  aria-expanded={customTimeOpen}
                >
                  직접 입력하기
                </button>
              </div>
            </div>

            {customTimeOpen && (
              <div className="today-custom-time-row">
                <label htmlFor="custom-start-time">직접 시작 시간</label>
                <input
                  id="custom-start-time"
                  className="input"
                  type="time"
                  value={selectedStart ?? ''}
                  onChange={(event) => handleStartSelect(event.target.value)}
                />
              </div>
            )}

            <div className="today-time-section">
              <div className="today-time-label">소요</div>
              <div className="today-duration-options">
                {durationOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`today-duration-option ${selectedDuration === option.value ? 'active' : ''}`}
                    onClick={() => handleDurationSelect(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="today-time-result">
              <span>{timeLabel ? `🕒 ${timeLabel} 설정됨` : '시작 시간과 소요 시간을 고르면 여기에 표시됩니다'}</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message today-error">
          {error}
          <button type="button" onClick={() => setError('')} aria-label="에러 닫기">×</button>
        </div>
      )}

      {loading && <div className="loading">불러오는 중...</div>}

      {!loading && (
        <div className="today-list">
          {activeItems.map((item) => {
            const itemId = getItemId(item);
            const isPending = pendingItemIds.has(getPendingKey(itemId));
            const itemMemo = getItemMemo(item);
            const itemTime = formatTimeRange(getItemStart(item), getItemEnd(item));
            const itemPriority = priorityOptions.find((option) => option.value === item.priority) ?? selectedPriority;
            const itemStatus = getItemStatus(item);
            const statusLabel = getStatusLabel(itemStatus);

            return (
              <div key={itemId ?? getItemTitle(item)} className="today-item card">
                <button
                  className="today-check-button"
                  type="button"
                  onClick={() => handleComplete(item)}
                  disabled={isPending || !itemId}
                  aria-busy={isPending}
                  title="완료"
                >
                  <span />
                </button>
                <div className="today-item-body">
                  <div className="today-item-title">{getItemTitle(item)}</div>
                  {itemMemo && <div className="today-item-memo">{itemMemo}</div>}
                </div>
                {itemTime && <span className="today-time-badge">🕒 {itemTime}</span>}
                <span className={`today-priority-badge priority-${String(item.priority ?? 'SHOULD').toLowerCase()}`}>
                  {itemPriority?.label ?? '🌱 하면 좋은 것'}
                </span>
                {statusLabel && <span className="today-status-badge">{statusLabel}</span>}
                {isAdjustableItem(item)
                  ? renderActionMenu(item, isPending)
                  : renderDeleteButton(item, isPending)}
              </div>
            );
          })}

          {doneItems.length > 0 && activeItems.length > 0 && (
            <div className="todo-divider"><span>완료</span></div>
          )}

          {doneItems.map((item) => {
            const itemId = getItemId(item);
            const isPending = pendingItemIds.has(getPendingKey(itemId));
            const isDisabled = isPending || !itemId;

            return (
            <div key={itemId ?? getItemTitle(item)} className="today-item today-item-done card">
              <button
                className="today-check-button done"
                type="button"
                onClick={() => handleComplete(item)}
                disabled={isDisabled}
                aria-busy={isPending}
                title="완료 해제"
              >
                <span>✓</span>
              </button>
              <div className="today-item-body">
                <div className="today-item-title">{getItemTitle(item)}</div>
              </div>
            </div>
            );
          })}

          {items.length === 0 && (
            <div className="today-empty-state">
              <div className="today-empty-icon">📝</div>
              <p>오늘 해볼 것이 없어요</p>
              <p>위에서 하나만 가볍게 추가해보세요.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
