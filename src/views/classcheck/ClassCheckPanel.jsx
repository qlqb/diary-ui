/**
 * 프로젝트의 "이번 주 수업 확인". 끝난 수업 중 아직 확인하지 않은 회차를 모아 보이고, 기본값이 있는 회차는 [모두 맞아요] 한 번에.
 *
 * ★ 시간표에서 쉰 날은 서버가 빼고 준다. 확인하지 않아도 앱은 쓸 수 있다 — 진도가 "추정"으로 보일 뿐이다.
 * ★ 저장하고 다시 불러올 때까지 조작을 막는다(옛 판으로 다시 보내지 않게).
 * ★ 다른 곳에서 먼저 바꿨으면(409) 다시 불러온 뒤 그렇게 말한다. 다시 불러오지 못하면 그 사실과 [다시 불러오기]를 보인다.
 * ★ [모두 맞아요]는 한 번에 20회차까지(서버가 요청 전체를 한 번에 저장한다 — 나누어 보내지 않는다).
 * ★ 과목마다 "수업 후 확인 묻기"를 끌 수 있다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { classApi } from './classSessionApi.js';
import { MAX_ITEMS, confirmItem, sessionViewKey } from '../../lib/classCheck.js';
import ClassCheckSession from './ClassCheckSession.jsx';
import '../../styles/class-check.css';

const CONFLICT = '다른 곳에서 먼저 바뀌었어요. 다시 불러왔어요.';
const RELOAD_FAILED = '수업 확인을 다시 불러오지 못했어요.';

export default function ClassCheckPanel({ courseId, refreshToken = 0, onChanged }) {
  const [view, setView] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null); // { text, alert }
  const ticket = useRef(0);

  /**
   * @return 'ok' | 'failed' | 'stale'(더 늦게 시작한 조회가 있다 — 그 조회가 화면을 그린다). 가장 늦은 조회가 끝날 때까지 loading이다.
   */
  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    const api = classApi();
    if (!api?.pending) return 'failed';
    setLoading(true);
    try {
      const next = await api.pending(courseId, 7);
      if (ticket.current !== mine) return 'stale';
      setView(next);
      setLoadError(null);
      return 'ok';
    } catch (err) {
      if (ticket.current !== mine) return 'stale';
      setLoadError(err.message || RELOAD_FAILED);
      return 'failed';
    } finally {
      if (ticket.current === mine) setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    (async () => { await load(); })();
    return () => { ticket.current += 1; };
  }, [load, refreshToken]);

  const send = async (items, done) => {
    setBusy(true);
    setNotice(null);
    let result;
    try {
      await classApi().confirm(courseId, items);
      result = { text: done, alert: false };
      onChanged?.();
    } catch (err) {
      result = err.status === 409 ? { text: CONFLICT, alert: true, conflict: true }
        : { text: err.message || '저장하지 못했어요.', alert: true };
    }
    const reloaded = await load();
    if (result.conflict && reloaded === 'failed') result = { text: `다른 곳에서 먼저 바뀌었어요. ${RELOAD_FAILED}`, alert: true };
    setNotice(result);
    setBusy(false);
  };

  const togglePrompt = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await classApi().setPrompt(courseId, !view.promptEnabled);
    } catch (err) {
      setNotice({ text: err.message || '설정을 바꾸지 못했어요.', alert: true });
    }
    await load();
    setBusy(false);
  };

  const retry = async () => {
    setBusy(true);
    if (await load() === 'ok') setNotice(null);
    setBusy(false);
  };

  if (!view && !loadError) return null;
  const locked = busy || loading; // 저장 중이거나 다시 불러오는 중(옛 판으로 다시 보내지 않게)

  const sessions = view?.sessions ?? [];
  const withDefaults = sessions.filter((s) => (s.defaults ?? []).length > 0);
  const batch = withDefaults.slice(0, MAX_ITEMS);

  return (
    <section className="view-section class-check-panel" aria-label="이번 주 수업 확인">
      <h2 className="section-title"><CalendarCheck size={15} /> 이번 주 수업 확인</h2>
      {notice && <p className={notice.alert ? 'view-error' : 'view-notice'} role={notice.alert ? 'alert' : 'status'}>{notice.text}</p>}
      {loadError && (
        <p className="view-error" role="alert">
          {loadError}{' '}
          <button type="button" className="btn-ghost btn-sm" disabled={locked} onClick={retry}>다시 불러오기</button>
        </p>
      )}
      {view && !view.promptEnabled && <p className="view-dim">이 과목은 수업 후 확인을 묻지 않아요.</p>}
      {view?.promptEnabled && sessions.length === 0 && <p className="view-dim">확인할 수업이 없어요.</p>}
      {sessions.map((s) => (
        <ClassCheckSession key={sessionViewKey(s)} session={s} options={view.options ?? []} busy={locked}
          onConfirm={(action, picked) => send([confirmItem(s, action, picked)], '저장했어요.')} />
      ))}
      {view && (
        <div className="class-check-actions">
          {withDefaults.length > 1 && (
            <button type="button" className="btn-primary btn-sm" disabled={locked}
              onClick={() => send(batch.map((s) => confirmItem(s, 'COVERED', s.defaults)),
                withDefaults.length > batch.length ? `${batch.length}개를 저장했어요. 나머지는 다음에 확인해 주세요.` : '모두 저장했어요.')}>
              {withDefaults.length > batch.length ? `${batch.length}개 맞아요` : '모두 맞아요'}
            </button>
          )}
          <label className="class-check-toggle">
            <input type="checkbox" checked={Boolean(view.promptEnabled)} disabled={locked} onChange={togglePrompt} />
            {' '}수업 후 확인 묻기
          </label>
        </div>
      )}
    </section>
  );
}
