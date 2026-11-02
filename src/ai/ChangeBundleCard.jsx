/**
 * 상담이 제안한 변경 묶음(적용 전). 항목을 고르고 [적용]을 누를 때만 원본(일정·할 일·과제)이 바뀐다.
 *
 * - 추정 연결(근무 앞뒤 이동시간 등)은 기본 미선택이고 그 이유를 보인다. 저장된 연결은 기본 선택이다.
 * - 선택을 바꾸면 서버 리비전이 오른다 — 적용 요청은 그 리비전을 보낸다(다른 탭에서 바꿨으면 409로 다시 확인하게).
 * - 적용 요청은 시도마다 멱등 키를 하나 쓴다. 응답을 못 받아 다시 눌러도 같은 키라 두 번 적용되지 않는다.
 * - 검토 뒤 일정이 바뀌었으면(STALE) [다시 검토]로 최신 상태를 다시 확인한다. 확인 실패·이미 처리됨은 항목에 이유를 보인다.
 */

import { useMemo, useRef, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { changeBundleAPI } from '../api/api.js';

const CHECK_TEXT = {
  NOT_FOUND: '대상을 찾지 못했어요',
  INVALID: '지금 상태에서는 할 수 없어요',
  ALREADY_DONE: '이미 그렇게 돼 있어요',
  CONFLICT: '같은 대상에 다른 변경이 있어요',
  STALE: '검토한 뒤 바뀌었어요',
  READ_FAILED: '확인 중 서버에서 읽지 못했어요',
};

function newKey() {
  return `apply-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ChangeBundleCard({ bundle: initial, onApplied }) {
  const [bundle, setBundle] = useState(initial);
  const [state, setState] = useState(null); // { status: 'working'|'error'|'stale', message }
  const keyRef = useRef(null);
  const resolved = bundle.status !== 'PROPOSED';
  const selected = useMemo(() => bundle.items.filter((i) => i.selected).map((i) => i.itemId), [bundle]);
  const working = state?.status === 'working';

  const toggle = async (itemId) => {
    const next = selected.includes(itemId) ? selected.filter((id) => id !== itemId) : [...selected, itemId];
    setState({ status: 'working' });
    try {
      setBundle(await changeBundleAPI.select(bundle.bundleId, bundle.revision, next));
      keyRef.current = null; // 내용이 바뀌었으니 새 적용 시도다
      setState(null);
    } catch (err) {
      setState({ status: 'error', message: err.message || '선택을 바꾸지 못했어요' });
    }
  };

  const apply = async () => {
    if (!keyRef.current) keyRef.current = newKey();
    setState({ status: 'working' });
    try {
      const applied = await changeBundleAPI.apply(bundle.bundleId, bundle.revision, selected, keyRef.current);
      setBundle(applied);
      setState(null);
      await onApplied?.(applied);
    } catch (err) {
      const stale = err.code === 'E409_049' || err.code === 'E409_048';
      setState({ status: stale ? 'stale' : 'error', message: err.message || '적용하지 못했어요' });
    }
  };

  const refresh = async () => {
    setState({ status: 'working' });
    try {
      setBundle(await changeBundleAPI.refresh(bundle.bundleId, bundle.revision));
      keyRef.current = null;
      setState(null);
    } catch (err) {
      // 리비전이 이미 바뀌었으면 최신 묶음을 다시 받는다
      try {
        setBundle(await changeBundleAPI.get(bundle.bundleId));
        setState(null);
      } catch {
        setState({ status: 'error', message: err.message || '다시 검토하지 못했어요' });
      }
    }
  };

  const dismiss = async () => {
    setState({ status: 'working' });
    try {
      setBundle(await changeBundleAPI.dismiss(bundle.bundleId));
      setState(null);
    } catch (err) {
      setState({ status: 'error', message: err.message || '닫지 못했어요' });
    }
  };

  return (
    <div className={`ai-schedule-card ai-change-bundle${resolved ? ' is-resolved' : ''}`} aria-label="변경 제안">
      <div className="ai-schedule-head">
        <span className="ai-schedule-title">
          {bundle.status === 'APPLIED' ? '적용한 변경' : bundle.status === 'DISMISSED' ? '적용하지 않은 변경' : '변경 제안(아직 적용 전)'}
        </span>
      </div>
      <ul className="ai-change-items">
        {bundle.items.map((item) => {
          const failed = item.checkCode && item.checkCode !== 'OK';
          return (
            <li key={item.itemId} className="ai-change-item">
              <label>
                <input type="checkbox" checked={item.selected} disabled={resolved || working || failed}
                  onChange={() => toggle(item.itemId)} aria-label={item.summary} />
                {' '}
                <span>{item.summary}</span>
              </label>
              {item.origin === 'INFERRED_LINK' && (
                <p className="ai-schedule-note">함께 뺄지 골라 주세요 — 제목·시각으로 추정한 연결이에요</p>
              )}
              {item.origin === 'STORED_LINK' && <p className="ai-schedule-note">이 일정에 연결된 항목이에요</p>}
              {failed && <p className="ai-error">{CHECK_TEXT[item.checkCode] ?? item.checkMessage}</p>}
              {item.blocked && <p className="ai-error">함께 골라야 하는 항목이 빠져 있어요</p>}
              {resolved && <p className="ai-schedule-resolved">{item.status === 'APPLIED' ? '적용됨' : '적용 안 함'}</p>}
            </li>
          );
        })}
      </ul>
      {state?.status === 'error' && <p className="ai-error">{state.message}</p>}
      {state?.status === 'stale' && (
        <p className="ai-error">{state.message} 최신 일정으로 다시 확인한 뒤 적용해 주세요.</p>
      )}
      {!resolved && (
        <div className="ai-schedule-actions">
          {state?.status === 'stale' ? (
            <button type="button" className="btn-primary btn-sm" disabled={working} onClick={refresh}>
              <RefreshCw size={13} /> 다시 검토
            </button>
          ) : (
            <button type="button" className="btn-primary btn-sm" disabled={working || selected.length === 0} onClick={apply}>
              <Check size={13} /> 고른 {selected.length}개 적용
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" disabled={working} onClick={dismiss}>
            <X size={13} /> 적용 안 함
          </button>
        </div>
      )}
    </div>
  );
}
