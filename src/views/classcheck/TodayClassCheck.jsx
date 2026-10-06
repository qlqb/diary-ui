/**
 * 오늘 화면의 수업 확인 카드 — 끝난 수업 중 확인하지 않은 가장 최근 회차 하나.
 *
 * ★ 과목마다 최근 이틀만 본다(놓친 것은 프로젝트의 "이번 주 수업 확인"에서). [나중에]는 그 회차를 하루 접는다 — 저장소를 못 써도 이번
 *   화면에서는 바로 다음 회차로 넘어간다.
 * ★ 저장하고 다시 불러올 때까지 조작을 막는다. 못 읽어도 오늘 화면은 그대로 쓴다(카드만 안 보인다).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { classApi } from './classSessionApi.js';
import { confirmItem, latestPending, postpone, sessionKey, sessionViewKey } from '../../lib/classCheck.js';
import ClassCheckSession from './ClassCheckSession.jsx';
import '../../styles/class-check.css';

export default function TodayClassCheck({ projectTitles = {} }) {
  const [views, setViews] = useState(null);
  const [skipped, setSkipped] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { text, alert }
  const ticket = useRef(0);
  const courseIds = Object.keys(projectTitles).join(',');

  /** @return 모든 과목을 읽었으면 true */
  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    const api = classApi();
    if (!api?.pending || !courseIds) { setViews({ byCourse: {}, at: Date.now() }); return true; }
    const next = {};
    let ok = true;
    await Promise.all(courseIds.split(',').map(async (id) => {
      try { next[id] = await api.pending(Number(id), 2); } catch { ok = false; /* 그 과목만 건너뛴다 */ }
    }));
    if (ticket.current === mine) setViews({ byCourse: next, at: Date.now() });
    return ok;
  }, [courseIds]);

  useEffect(() => {
    (async () => { await load(); })();
    return () => { ticket.current += 1; };
  }, [load]);

  // 접힘 기한은 불러온 때 기준으로 본다(그리기 중에 시계를 읽지 않는다)
  const current = views ? latestPending(views.byCourse, views.at, skipped) : null;
  if (!current && !notice) return null;

  const confirm = async (action, picked) => {
    setBusy(true);
    setNotice(null);
    let result;
    try {
      await classApi().confirm(current.courseId, [confirmItem(current.session, action, picked)]);
      result = { text: '저장했어요.', alert: false };
    } catch (err) {
      result = err.status === 409 ? { text: '다른 곳에서 먼저 바뀌었어요.', alert: true, conflict: true }
        : { text: err.message || '저장하지 못했어요.', alert: true };
    }
    const reloaded = await load();
    if (result.conflict) {
      result = { ...result, text: reloaded ? '다른 곳에서 먼저 바뀌었어요. 다시 불러왔어요.'
        : '다른 곳에서 먼저 바뀌었어요. 다시 불러오지 못했어요 — 프로젝트의 수업 확인에서 다시 볼 수 있어요.' };
    }
    setNotice(result);
    setBusy(false);
  };

  const later = () => {
    const key = sessionKey(current.courseId, current.session);
    postpone(key);
    setSkipped((prev) => new Set(prev).add(key));
    setNotice(null);
  };

  return (
    <section className="view-section today-class-check" aria-label="수업 확인">
      {notice && <p className={notice.alert ? 'view-error' : 'view-notice'} role={notice.alert ? 'alert' : 'status'}>{notice.text}</p>}
      {current && (
        <ClassCheckSession key={`${current.courseId}-${sessionViewKey(current.session)}`}
          title={projectTitles[current.courseId]} session={current.session} options={current.options} busy={busy}
          onConfirm={confirm} onLater={later} />
      )}
    </section>
  );
}
