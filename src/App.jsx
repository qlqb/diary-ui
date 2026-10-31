import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

import './App.css';
import './styles/workspace.css';

import { authAPI } from './api/api';
import MainShell from './shell/MainShell.jsx';

/**
 * 로그인/회원가입과 셸 전환만 맡는다. 화면 구성은 전부 MainShell 아래에 있다.
 */
function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        setUser(await authAPI.getCurrentUser());
        setView('main');
      } catch {
        localStorage.removeItem('token');
        setUser(null);
        setView('login');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleLogin = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      if (response.token) localStorage.setItem('token', response.token);
      setUser(response.user);
      setView('main');
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
      setView('main');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || '회원가입에 실패했습니다.' };
    }
  };

  const handleLogout = () => {
    authAPI.logout();
    setUser(null);
    setView('login');
  };

  if (loading) return <div className="loading">불러오는 중...</div>;

  return (
    <div className="app">
      {view === 'login' && (
        <AuthView mode="login" onAuth={handleLogin} onSwitch={() => setView('signup')} />
      )}
      {view === 'signup' && (
        <AuthView mode="signup" onAuth={handleSignup} onSwitch={() => setView('login')} />
      )}
      {view === 'main' && user && <MainShell user={user} onLogout={handleLogout} />}
    </div>
  );
}

function AuthView({ mode, onAuth, onSwitch }) {
  const [form, setForm] = useState({ email: '', password: '', nickname: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isLogin = mode === 'login';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const result = isLogin
      ? await onAuth(form.email.trim(), form.password)
      : await onAuth(form.email.trim(), form.password, form.nickname.trim());
    if (!result.success) setError(result.error);
    setSubmitting(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Sparkles size={18} /></div>
          <h1>오늘조각</h1>
        </div>
        <p className="subtitle">AI와 이야기하고, 그 결정을 오늘로 옮기세요</p>

        <div className="auth-tabs">
          <button type="button" className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => { if (!isLogin) onSwitch(); }}>
            로그인
          </button>
          <button type="button" className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => { if (isLogin) onSwitch(); }}>
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

          <button type="submit" className="btn-primary" style={{ padding: '10px', marginTop: 2 }} disabled={submitting}>
            {submitting ? (isLogin ? '로그인 중...' : '가입 중...') : (isLogin ? '로그인' : '회원가입')}
          </button>
        </form>

        <button type="button" className="link-button" onClick={onSwitch}>
          {isLogin ? '계정이 없으신가요? 회원가입하기' : '이미 계정이 있으신가요? 로그인하기'}
        </button>
      </div>
    </div>
  );
}

export default App;
