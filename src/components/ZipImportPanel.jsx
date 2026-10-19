/**
 * 압축 파일 가져오기 패널.
 *
 * 흐름은 셋이다: 목록 확인 → 고른 파일 확정 → 파일별 결과. 압축 자체는 자료가 되지 않고, 고른
 * 파일 하나하나가 독립된 자료가 된다. 확정 뒤의 생성은 서버가 하므로 이 화면을 닫아도 계속되고,
 * 다시 들어오면 부모가 진행 중인 가져오기를 다시 넘겨준다.
 *
 * 여기서 "완료"는 자료가 만들어졌다는 뜻이지 AI 분석이 끝났다는 뜻이 아니다. 문구를 그렇게 쓴다 —
 * 자료함 목록의 분석 상태 칩이 그 다음 단계를 따로 보여준다.
 *
 * 목록은 둘로 나눈다: 가져올 수 있는(가져온) 파일 / 가져오지 못한 파일(실패·미지원). 미지원은 가져오기
 * 전체의 오류가 아니다 — 압축 안에 이 앱이 읽지 않는 형식이 섞여 있었다는 사실일 뿐이라 경고 아이콘을
 * 쓰지 않는다. 다만 실패든 미지원이든 그 파일 내용은 상담·계획에 쓰이지 않으므로 그 말은 똑같이 붙인다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, FileArchive, Info, Loader2, RotateCcw, X } from 'lucide-react';
import { zipImportAPI } from '../api/api.js';
import { NOT_USED_IMPACT } from '../lib/materialStages.js';
import '../styles/material-status.css';

const POLL_MS = 1500;

const ENTRY_LABEL = Object.freeze({
  PENDING: '대기',
  QUEUED: '차례 기다리는 중',
  IMPORTING: '가져오는 중',
  DONE: '자료 등록 완료',
  FAILED: '가져오지 못했어요',
  UNSUPPORTED: '이 앱이 읽지 않는 형식이에요',
});

/** 이 상태에서는 서버가 계속 일하고 있다 — 화면도 따라가야 한다. */
const RUNNING = new Set(['PREPARING', 'IMPORTING']);

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function ZipImportPanel({ zipImport, onChanged, onClose }) {
  const [current, setCurrent] = useState(zipImport);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const initialized = useRef(null);

  // 새로 받은 가져오기면 선택을 초기화한다. 같은 건이면 사용자가 만지던 선택을 유지한다.
  useEffect(() => {
    setCurrent(zipImport);
    if (initialized.current !== zipImport?.importId) {
      initialized.current = zipImport?.importId;
      setSelected(new Set((zipImport?.entries ?? [])
          .filter((e) => e.supported && e.status === 'PENDING')
          .map((e) => e.entryId)));
      setError(null);
    }
  }, [zipImport]);

  const refresh = useCallback(async () => {
    if (!current?.importId) return;
    try {
      const next = await zipImportAPI.get(current.importId);
      setCurrent(next);
      onChanged?.(next);
    } catch (err) {
      setError(err.message || '가져오기 상태를 불러오지 못했습니다.');
    }
  }, [current?.importId, onChanged]);

  // 서버가 일하는 동안만 따라본다. 끝나면 멈춘다 — 끝난 화면을 계속 두드릴 이유가 없다.
  useEffect(() => {
    if (!current || !RUNNING.has(current.status)) return undefined;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [current, refresh]);

  const entries = useMemo(() => current?.entries ?? [], [current]);
  const selectable = useMemo(
      () => entries.filter((e) => e.supported && e.status === 'PENDING'), [entries]);
  const failed = useMemo(() => entries.filter((e) => e.status === 'FAILED'), [entries]);
  const unsupported = useMemo(() => entries.filter((e) => !e.supported && e.status !== 'FAILED'), [entries]);
  const usable = useMemo(() => entries.filter((e) => e.supported && e.status !== 'FAILED'), [entries]);
  const doneEntries = useMemo(() => entries.filter((e) => e.status === 'DONE'), [entries]);
  /**
   * 고를 수 있는가. 한 번 확정한 뒤에도 남겨 둔 파일을 더 가져올 수 있어야 하므로 상태가 아니라
   * "아직 고르지 않은 파일이 있고 원본 압축이 남아 있는가"로 판단한다. 취소·만료는 제외다.
   */
  const closed = current?.status === 'CANCELLED' || current?.status === 'EXPIRED';
  const waiting = !closed && selectable.length > 0 && current?.archiveAvailable !== false;

  const toggle = (entryId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setCurrent(next);
      onChanged?.(next);
    } catch (err) {
      setError(err.message || '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const renderEntry = (entry) => {
    const problem = entry.status === 'FAILED' || !entry.supported;
    return (
        <li key={entry.entryId}
            className={`zip-import-item${entry.supported ? '' : ' is-unsupported'}`}>
          {waiting && entry.supported && entry.status === 'PENDING' ? (
              <label className="zip-import-check">
                <input
                    type="checkbox"
                    checked={selected.has(entry.entryId)}
                    onChange={() => toggle(entry.entryId)}
                    disabled={busy}
                />
                <span className="zip-import-path">{entry.entryPath}</span>
              </label>
          ) : (
              <span className="zip-import-path">{entry.entryPath}</span>
          )}
          <span className="zip-import-meta">{formatSize(entry.sizeBytes)}</span>
          <span className={`zip-import-status is-${entry.status.toLowerCase()}`}>
            {entry.status === 'IMPORTING' && <Loader2 size={12} className="spin" />}
            {entry.status === 'DONE' && <Check size={12} />}
            {entry.status === 'FAILED' && <AlertCircle size={12} />}
            {entry.status !== 'FAILED' && !entry.supported && <Info size={12} />}
            {' '}
            <span className="zip-import-kind">
              {entry.status === 'FAILED' ? '실패 · ' : !entry.supported ? '미지원 · ' : ''}
            </span>
            {entry.skipReason || entry.errorMessage || ENTRY_LABEL[entry.status]}
          </span>
          {entry.status === 'FAILED' && current.archiveAvailable && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                      onClick={() => run(() => zipImportAPI.retryEntry(current.importId, entry.entryId))}>
                <RotateCcw size={12} /> 다시
              </button>
          )}
          {problem && <span className="zip-import-impact">{NOT_USED_IMPACT}</span>}
        </li>
    );
  };

  if (!current) return null;

  return (
      <section className="zip-import" aria-label="압축 파일 가져오기">
        <header className="zip-import-head">
          <span className="zip-import-icon"><FileArchive size={16} /></span>
          <div className="zip-import-title">
            <strong>{current.originalFilename}</strong>
            <span className="zip-import-sub">{statusLine(current)}</span>
          </div>
          <button type="button" className="icon-btn" aria-label="가져오기 닫기" onClick={onClose}>
            <X size={14} />
          </button>
        </header>

        {error && <p className="view-error">{error}</p>}
        {current.message && <p className="zip-import-note">{current.message}</p>}

        {/* 한 줄 요약. 일부가 안 됐는데 전체 성공처럼 끝내지 않는다. */}
        {(doneEntries.length > 0 || failed.length > 0) && (
            <p className="zip-import-summary" role="status">
              {doneEntries.length}개 올림 · {failed.length}개 실패 · {unsupported.length}개 미지원
            </p>
        )}

        {usable.length > 0 && (
            <>
              <p className="zip-import-group-title">가져올 수 있는 파일 {usable.length}개</p>
              <ul className="zip-import-list">
                {usable.map((entry) => renderEntry(entry))}
              </ul>
            </>
        )}

        {(failed.length > 0 || unsupported.length > 0) && (
            <>
              <p className="zip-import-group-title">
                가져오지 못한 파일 {failed.length + unsupported.length}개
                {' '}(실패 {failed.length} · 미지원 {unsupported.length})
              </p>
              <ul className="zip-import-list">
                {[...failed, ...unsupported].map((entry) => renderEntry(entry))}
              </ul>
            </>
        )}

        <div className="zip-import-foot">
          <span className="zip-import-hint">
            {waiting
                ? `가져올 파일 ${selected.size}개 선택 · 압축 자체는 자료가 되지 않아요`
                : '고른 파일이 자료로 등록되면 자동 분석이 이어서 돌아요'}
          </span>
          {waiting && (
              <button type="button" className="btn-primary btn-sm"
                      disabled={busy || selected.size === 0}
                      onClick={() => run(() => zipImportAPI.confirm(current.importId, [...selected]))}>
                {busy ? <><Loader2 size={13} className="spin" /> 시작하는 중</> : `${selected.size}개 가져오기`}
              </button>
          )}
          {!waiting && failed.length > 0 && current.archiveAvailable && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                      onClick={() => run(async () => {
                        let latest = current;
                        for (const entry of failed) {
                          latest = await zipImportAPI.retryEntry(current.importId, entry.entryId);
                        }
                        return latest;
                      })}>
                <RotateCcw size={13} /> 실패한 {failed.length}개 다시
              </button>
          )}
          {current.status === 'READY' && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy}
                      onClick={() => run(() => zipImportAPI.cancel(current.importId))}>
                가져오기 취소
              </button>
          )}
        </div>
      </section>
  );
}

/** 지금 무슨 단계인지 한 줄로. "완료"가 어디까지의 완료인지 분명해야 한다. */
function statusLine(zipImport) {
  const { status, entryCount, selectableCount, doneCount, failedCount, remainingCount } = zipImport;
  switch (status) {
    case 'PREPARING':
      return '압축 안을 살펴보는 중';
    case 'READY':
      return `압축 안 ${entryCount}개 중 ${selectableCount}개를 가져올 수 있어요`;
    case 'IMPORTING':
      return `자료 등록 중 · 남은 ${remainingCount}개 · 완료 ${doneCount}개`;
    case 'COMPLETED':
      return `자료 ${doneCount}개 등록 완료 (분석은 이어서 진행돼요)`;
    case 'PARTIAL':
      // 실패한 파일이 있다 — "완료"라고 하지 않는다. 미지원 개수는 아래 요약 줄이 따로 말한다.
      return `자료 ${doneCount}개 등록 · ${failedCount}개 실패`;
    case 'FAILED':
      return '가져오지 못했어요';
    case 'CANCELLED':
      return '취소했어요';
    case 'EXPIRED':
      return '보관 기한이 지나 원본 압축을 지웠어요';
    default:
      return '';
  }
}
