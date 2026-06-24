import { useEffect, useState } from 'react';
import './App.css';

import { authAPI, diaryAPI } from './api/api';
import DiaryListView from './DiaryListView';
import DiaryEditorView from './DiaryEditorView';
import StatisticsView from './StatisticsView';

/**
 * Prismatic Diary React Application
 *
 * 역할:
 * - 로그인 / 회원가입 화면 전환
 * - JWT 기반 사용자 복구
 * - 일기 메인 화면 진입
 * - 일기 목록 / 작성 / 통계 탭 관리
 */
function App() {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('login'); // login, signup, diary
  const [loading, setLoading] = useState(true);

  // 앱 초기화: 토큰이 있으면 현재 사용자 정보 복구
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
      } catch (error) {
        console.error('사용자 정보 로드 실패:', error);
        localStorage.removeItem('token');
        setUser(null);
        setCurrentView('login');
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  // 로그인 처리
  const handleLogin = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);

      if (response.token) {
        localStorage.setItem('token', response.token);
      }

      setUser(response.user);
      setCurrentView('diary');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message || '로그인에 실패했습니다',
      };
    }
  };

  // 회원가입 처리
  const handleSignup = async (email, password, nickname) => {
    try {
      const response = await authAPI.signup(email, password, nickname);

      if (response.token) {
        localStorage.setItem('token', response.token);
      }

      setUser(response.user);
      setCurrentView('diary');

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message || '회원가입에 실패했습니다',
      };
    }
  };

  // 로그아웃 처리
  const handleLogout = () => {
    authAPI.logout();
    setUser(null);
    setCurrentView('login');
  };

  if (loading) {
    return <div className="loading">로딩 중...</div>;
  }

  return (
      <div className="app">
        {/*앞의 조건이 true면 화면 출력 false면 출력하지 않음*/}
        {currentView === 'login' && (
            <LoginView
                onLogin={handleLogin}
                onSwitchToSignup={() => setCurrentView('signup')}
            />
        )}

        {currentView === 'signup' && (
            <SignupView
                onSignup={handleSignup}
                onSwitchToLogin={() => setCurrentView('login')}
            />
        )}

        {currentView === 'diary' && user && (
            <DiaryView
                user={user}
                onLogout={handleLogout}
            />
        )}
      </div>
  );
}

/**
 * 로그인 화면
 */
function LoginView({ onLogin, onSwitchToSignup }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * error 메시지 초기화
   * loading=true로 submit버튼 disable 속성으로 비활성화
   * onLogin 함수가 authAPI의 login을 통해 api를 호출하고 상태를 리턴해줌
   * @param e
   * @returns {Promise<void>}
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    setLoading(true);

    // password는 공백을 의도적으로 사용할 수도 있으니 trim하지 않음
    const result = await onLogin(email.trim(), password);

    if (!result.success) {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Prismatic Diary</h1>
          <p className="subtitle">매일의 순간을 빛나는 기억으로</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />

            <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
            />

            {error && <div className="error-message">{error}</div>}

            <button type="submit" disabled={loading}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <button
              type="button"
              className="link-button"
              onClick={onSwitchToSignup}
          >
            회원가입하기
          </button>
        </div>
      </div>
  );
}

/**
 * 회원가입 화면
 */
function SignupView({ onSignup, onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    setLoading(true);

    const result = await onSignup(email, password, nickname);

    if (!result.success) {
      setError(result.error);
    }

    setLoading(false);
  };

  return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>Prismatic Diary</h1>
          <p className="subtitle">매일의 순간을 빛나는 기억으로</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <input
                type="text"
                placeholder="닉네임"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
            />

            <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />

            <input
                type="password"
                placeholder="비밀번호 (최소 4자)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength="4"
                required
            />

            {error && <div className="error-message">{error}</div>}

            <button type="submit" disabled={loading}>
              {loading ? '가입 중...' : '회원가입'}
            </button>
          </form>

          <button
              type="button"
              className="link-button"
              onClick={onSwitchToLogin}
          >
            이미 계정이 있으신가요? 로그인하기
          </button>
        </div>
      </div>
  );
}

/**
 * 일기 메인 화면
 */
function DiaryView({ user, onLogout }) {
  const [currentTab, setCurrentTab] = useState('list'); // list, editor, statistics
  const [diaries, setDiaries] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filter, setFilter] = useState({});
  const [editingDiary, setEditingDiary] = useState(null);
  const [loading, setLoading] = useState(false);

  // 일기 목록 로드
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

  // 검색
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

  // 일기 작성/수정 완료
  const handleDiarySaved = () => {
    setCurrentTab('list');
    setEditingDiary(null);
    loadDiaries(currentPage);
  };

  // 일기 삭제
  const handleDelete = async (diaryId) => {
    if (!confirm('정말 삭제하시겠습니까?')) {
      return;
    }

    try {
      await diaryAPI.deleteDiary(diaryId);
      alert('삭제되었습니다');
      loadDiaries(currentPage);
    } catch (error) {
      alert('삭제에 실패했습니다: ' + error.message);
    }
  };

  // 즐겨찾기 토글
  const handleToggleFavorite = async (diaryId) => {
    try {
      await diaryAPI.toggleFavorite(diaryId);
      loadDiaries(currentPage);
    } catch (error) {
      alert('즐겨찾기 변경에 실패했습니다: ' + error.message);
    }
  };

  // 목록 탭 진입 또는 필터 변경 시 목록 재조회
  useEffect(() => {
    if (currentTab === 'list') {
      loadDiaries(1);
    }
  }, [currentTab, filter]);

  return (
      <div className="diary-container">
        <header className="diary-header">
          <h1>Prismatic Diary</h1>

          <div className="user-info">
            <span>{user.nickname}님</span>
            <button type="button" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </header>

        <nav className="tab-nav">
          <button
              type="button"
              className={currentTab === 'list' ? 'active' : ''}
              onClick={() => setCurrentTab('list')}
          >
            일기 목록
          </button>

          <button
              type="button"
              className={currentTab === 'editor' ? 'active' : ''}
              onClick={() => {
                setEditingDiary(null);
                setCurrentTab('editor');
              }}
          >
            새 일기 작성
          </button>

          <button
              type="button"
              className={currentTab === 'statistics' ? 'active' : ''}
              onClick={() => setCurrentTab('statistics')}
          >
            통계
          </button>
        </nav>

        <main className="diary-content">
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
                  onEdit={(diary) => {
                    setEditingDiary(diary);
                    setCurrentTab('editor');
                  }}
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
        </main>
      </div>
  );
}

export default App;