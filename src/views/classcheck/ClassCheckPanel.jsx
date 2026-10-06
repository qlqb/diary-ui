/**
 * 프로젝트의 "이번 주 수업 확인". 끝난 수업 중 아직 확인하지 않은 회차를 모아 보이고, 기본값이 있는 회차는 [모두 맞아요] 한 번에.
 *
 * ★ 시간표에서 쉰 날은 서버가 빼고 준다. 확인하지 않아도 앱은 쓸 수 있다 — 진도가 "추정"으로 보일 뿐이다.
 * ★ 다른 곳에서 먼저 바꿨으면(409) 다시 불러오고 그 사실을 말한다.
 * ★ 과목마다 "수업 후 확인 묻기"를 끌 수 있다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { classApi } from './classSessionApi.js';
import { confirmItem } from '../../lib/classCheck.js';
import ClassCheckSession from './ClassCheckSession.jsx';
import '../../styles/class-check.css';

const CONFLICT = '다른 곳에서 먼저 바뀌었어요. 다시 불러왔어요.';

export default function ClassCheckPanel({ courseId, refreshToken = 0, onChanged }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    const api = classApi();
    if (!api?.pending) return;
    try {
      const next = await api.pending(courseId, 7);
      if (ticket.current === mine) { setView(next); setError(null); }
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '수업 확인을 불러오지 못했어요.');
    }
  }, [courseId]);

  useEffect(() => {
    (async () => { await load(); })();
    return () => { ticket.current += 1; };
  }, [load, refreshToken]);

  const send = async (items, done) => {
    setBusy(true);
    setNotice(null);
    try {
      await classApi().confirm(courseId, items);
      setNotice(done);
      onChanged?.();
    } catch (err) {
      setNotice(err.status === 409 ? CONFLICT : (err.message || '저장하지 못했어요.'));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const togglePrompt = async () => {
    setBusy(true);
    try {
      await classApi().setPrompt(courseId, !view.promptEnabled);
      await load();
    } catch (err) {
      setNotice(err.message || '설정을 바꾸지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <section className="view-section"><p className="view-error">{error}</p></section>;
  if (!view) return null;

  const sessions = view.sessions ?? [];
  const withDefaults = sessions.filter((s) => (s.defaults ?? []).length > 0);

  return (
    <section className="view-section class-check-panel" aria-label="이번 주 수업 확인">
      <h2 className="section-title"><CalendarCheck size={15} /> 이번 주 수업 확인</h2>
      {notice && <p className="view-notice">{notice}</p>}
      {!view.promptEnabled && <p className="view-dim">이 과목은 수업 후 확인을 묻지 않아요.</p>}
      {view.promptEnabled && sessions.length === 0 && <p className="view-dim">확인할 수업이 없어요.</p>}
      {sessions.map((s) => (
        <ClassCheckSession key={`${s.routineId}-${s.sourceDate}`} session={s} options={view.options ?? []} busy={busy}
          onConfirm={(action, picked) => send([confirmItem(s, action, picked)], '저장했어요.')} />
      ))}
      <div className="class-check-actions">
        {withDefaults.length > 1 && (
          <button type="button" className="btn-primary btn-sm" disabled={busy}
            onClick={() => send(withDefaults.map((s) => confirmItem(s, 'COVERED', s.defaults)), '모두 저장했어요.')}>
            모두 맞아요
          </button>
        )}
        <label className="class-check-toggle">
          <input type="checkbox" checked={Boolean(view.promptEnabled)} disabled={busy} onChange={togglePrompt} />
          {' '}수업 후 확인 묻기
        </label>
      </div>
    </section>
  );
}
