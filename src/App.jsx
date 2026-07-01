import { useEffect, useState } from 'react';
import './App.css';

import { authAPI, diaryAPI, todoAPI } from './api/api';
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
      if (!token) { setLoading(false); return; }
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
      return { success: false, error: error.message || '로그인에 실패했습니다' };
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
      return { success: false, error: error.message || '회원가입에 실패했습니다' };
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

/* ── 로그인 / 회원가입 통합 컴포넌트 ── */
function AuthView({ mode, onAuth, onSwitch }) {
  const [form, setForm] = useState({ email: '', password: '', nickname: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isLogin = mode === 'login';

  const handleSubmit = async (e) => {
    e.preventDefault();
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
          <div className="auth-logo-icon">📗</div>
          <h1>Prismatic Diary</h1>
        </div>
        <p className="subtitle">매일의 순간을 기록하세요</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => { if (!isLogin) onSwitch(); }}>로그인</button>
          <button className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => { if (isLogin) onSwitch(); }}>회원가입</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="input-wrap">
              <span className="input-icon">👤</span>
              <input className="input" type="text" placeholder="닉네임"
                value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} required />
            </div>
          )}
          <div className="input-wrap">
            <span className="input-icon">✉</span>
            <input className="input" type="email" placeholder="이메일"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="input-wrap">
            <span className="input-icon">🔒</span>
            <input className="input" type="password" placeholder={isLogin ? '비밀번호' : '비밀번호 (최소 4자)'}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={isLogin ? undefined : 4} required />
          </div>

          {error && <div className="error-message">⚠ {error}</div>}

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

/* ── 일기 메인 화면 ── */
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
      alert('일기 목록을 불러오는데 실패했습니다: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchKeyword.trim()) { loadDiaries(1); return; }
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
  }, [currentTab, filter]);

  const TAB_LIST = [
    { key: 'list',       label: '📋 일기 목록' },
    { key: 'editor',     label: '✏️ 새 일기 작성' },
    { key: 'statistics', label: '📊 통계' },
    { key: 'todo',       label: '✅ 오늘 해볼 것' },
  ];

  const nickname = user?.nickname || user?.name || user?.email?.split('@')[0] || '사용자';

  return (
    <>
      {/* 상단 네비게이션 */}
      <div className="nav-bar">
        <div className="nav-inner">
          <div className="nav-logo">
            <div className="nav-logo-icon">📗</div>
            <span>Prismatic Diary</span>
          </div>

          <nav className="tab-nav">
            {TAB_LIST.map(({ key, label }) => (
              <button
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
            <button className="nav-logout" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </div>
      </div>

      {/* 컨텐츠 */}
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
        {currentTab === 'todo' && <TodoView />}
      </div>
    </>
  );
}

/* ── 오늘 해볼 것 화면 ── */
function TodoView() {
  const today = todoAPI.getTodayString();

  const [todos, setTodos]                   = useState([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [form, setForm]                     = useState({ title: '', content: '', priority: 'MEDIUM' });

  const formatDateKo = (s) => {
    const [y, m, d] = s.split('-');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const day  = days[new Date(s).getDay()];
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 ${day}요일`;
  };

  const fetchTodos = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await todoAPI.getTodosByDate(today);
      setTodos(data ?? []);
    } catch (e) {
      setError(e.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTodos(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await todoAPI.createTodo({
        todoDate: today,
        title:    form.title.trim(),
        content:  form.content.trim() || null,
        priority: form.priority,
      });
      setForm({ title: '', content: '', priority: 'MEDIUM' });
      await fetchTodos();
    } catch (e) {
      setError(e.message || '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (todo) => {
    try {
      if (todo.status === 'DONE') {
        await todoAPI.markTodo(todo.todoId);
      } else {
        await todoAPI.markDone(todo.todoId);
      }
      await fetchTodos();
    } catch (e) {
      setError(e.message || '상태 변경에 실패했습니다.');
    }
  };

  const handleDelete = async (todoId) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      await todoAPI.deleteTodo(todoId);
      await fetchTodos();
    } catch (e) {
      setError(e.message || '삭제에 실패했습니다.');
    }
  };

  const doneCount  = todos.filter((t) => t.status === 'DONE').length;
  const totalCount = todos.length;
  const rate       = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const PRIORITY_LABEL = { HIGH: '🔴 높음', MEDIUM: '🟡 보통', LOW: '🟢 낮음' };

  return (
    <div className="todo-view">

      {/* 날짜 + 달성률 헤더 */}
      <div className="todo-header-card card">
        <div className="todo-header-left">
          <div className="todo-date">{formatDateKo(today)}</div>
          <div className="todo-sub">
            {totalCount === 0 ? '할 일을 추가해보세요' : `${doneCount}개 완료 / ${totalCount}개`}
          </div>
        </div>
        {totalCount > 0 && (
          <div className="todo-rate-wrap">
            <div className="todo-rate-circle">{rate}%</div>
            <div className="todo-rate-bar-wrap">
              <div className="todo-rate-bar">
                <div className="todo-rate-fill" style={{ width: `${rate}%` }} />
              </div>
              <div className="todo-rate-label">
                {rate === 100 ? '🎉 모두 완료!' : `${100 - rate}% 남았어요`}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 입력 폼 */}
      <div className="todo-form-card card">
        <div className="todo-form-title">할 일 추가</div>
        <div className="todo-form-fields">
          <input
            className="input"
            type="text"
            placeholder="무엇을 해볼 건가요?"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onKeyPress={(e) => e.key === 'Enter' && handleCreate()}
          />
          <input
            className="input"
            type="text"
            placeholder="메모 (선택)"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          <div className="todo-form-bottom">
            <div className="todo-priority-group">
              {['HIGH', 'MEDIUM', 'LOW'].map((p) => (
                <button
                  key={p}
                  className={`todo-priority-btn ${form.priority === p ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, priority: p })}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={!form.title.trim() || submitting}
            >
              {submitting ? '추가 중...' : '+ 추가'}
            </button>
          </div>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          ⚠ {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>✕</button>
        </div>
      )}

      {/* 로딩 */}
      {loading && <div className="loading">불러오는 중...</div>}

      {/* Todo 목록 */}
      {!loading && (
        <div className="todo-list">

          {/* 미완료 */}
          {todos.filter((t) => t.status !== 'DONE').map((todo) => (
            <div key={todo.todoId} className="todo-item card">
              <button
                className="todo-check-btn"
                onClick={() => handleToggle(todo)}
                title="완료 처리"
              >
                <div className="todo-checkbox" />
              </button>
              <div className="todo-item-body">
                <div className="todo-item-title">{todo.title}</div>
                {todo.content && <div className="todo-item-content">{todo.content}</div>}
              </div>
              <span className={`todo-priority-badge priority-${todo.priority?.toLowerCase()}`}>
                {PRIORITY_LABEL[todo.priority] ?? todo.priority}
              </span>
              <button className="todo-delete-btn" onClick={() => handleDelete(todo.todoId)} title="삭제">✕</button>
            </div>
          ))}

          {/* 구분선 */}
          {todos.some((t) => t.status === 'DONE') && todos.some((t) => t.status !== 'DONE') && (
            <div className="todo-divider"><span>완료됨</span></div>
          )}

          {/* 완료 */}
          {todos.filter((t) => t.status === 'DONE').map((todo) => (
            <div key={todo.todoId} className="todo-item todo-item-done card">
              <button
                className="todo-check-btn"
                onClick={() => handleToggle(todo)}
                title="미완료로 되돌리기"
              >
                <div className="todo-checkbox todo-checkbox-done">✓</div>
              </button>
              <div className="todo-item-body">
                <div className="todo-item-title todo-item-title-done">{todo.title}</div>
              </div>
              <button className="todo-delete-btn" onClick={() => handleDelete(todo.todoId)} title="삭제">✕</button>
            </div>
          ))}

          {/* 빈 상태 */}
          {todos.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <p>오늘 할 일이 없습니다</p>
              <p>위에서 할 일을 추가해보세요</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
