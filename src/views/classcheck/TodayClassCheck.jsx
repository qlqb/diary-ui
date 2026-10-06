/**
 * 오늘 화면의 수업 확인 카드 — 끝난 수업 중 확인하지 않은 가장 최근 회차 하나.
 *
 * ★ 과목마다 최근 이틀만 본다(놓친 것은 프로젝트의 "이번 주 수업 확인"에서). [나중에]는 그 회차를 하루 접는다.
 * ★ 못 읽어도 오늘 화면은 그대로 쓴다(카드만 안 보인다).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { classApi } from './classSessionApi.js';
import { confirmItem, latestPending, postpone, sessionKey } from '../../lib/classCheck.js';
import ClassCheckSession from './ClassCheckSession.jsx';
import '../../styles/class-check.css';

export default function TodayClassCheck({ projectTitles = {} }) {
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const ticket = useRef(0);
  const courseIds = Object.keys(projectTitles).join(',');

  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    const api = classApi();
    if (!api?.pending || !courseIds) { setCurrent(null); return; }
    const views = {};
    await Promise.all(courseIds.split(',').map(async (id) => {
      try { views[id] = await api.pending(Number(id), 2); } catch { /* 그 과목만 건너뛴다 */ }
    }));
    if (ticket.current === mine) setCurrent(latestPending(views));
  }, [courseIds]);

  useEffect(() => {
    (async () => { await load(); })();
    return () => { ticket.current += 1; };
  }, [load]);

  if (!current && !notice) return null;

  const confirm = async (action, picked) => {
    setBusy(true);
    setNotice(null);
    try {
      await classApi().confirm(current.courseId, [confirmItem(current.session, action, picked)]);
      setNotice('저장했어요.');
    } catch (err) {
      setNotice(err.status === 409 ? '다른 곳에서 먼저 바뀌었어요. 다시 불러왔어요.' : (err.message || '저장하지 못했어요.'));
    } finally {
      setBusy(false);
      await load();
    }
  };

  return (
    <section className="view-section today-class-check" aria-label="수업 확인">
      {notice && <p className="view-notice">{notice}</p>}
      {current && (
        <ClassCheckSession key={sessionKey(current.courseId, current.session)}
          title={projectTitles[current.courseId]} session={current.session} options={current.options} busy={busy}
          onConfirm={confirm}
          onLater={() => { postpone(sessionKey(current.courseId, current.session)); load(); }} />
      )}
    </section>
  );
}
