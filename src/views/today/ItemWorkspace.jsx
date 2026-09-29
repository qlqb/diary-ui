/**
 * 학습 실행 작업 공간 — 오늘·계획·일정·프로젝트의 항목에서 연다.
 *
 * 먼저 보이는 것은 넷이다: 이 활동의 목표(제목) · 첫 행동 · 시작 자료와 위치 · 완료 기준. 단계별 안내·원문 근거·
 * 시작 도움·지난 기록은 필요할 때 펼친다. 같은 실행 항목을 보므로 여기서 남긴 기록은 오늘·계획 화면에 그대로 보인다
 * (화면별 원본이나 진도를 따로 두지 않는다).
 *
 * ★ 여는 것만으로 모델을 부르지 않는다. 단계 안내는 [단계별 안내]를 펼칠 때(없으면 그때 한 번 만든다), 시작 도움은
 *   사용자가 요청할 때만 만든다.
 * ★ 시작 도움은 첫 행동을 구체화할 뿐 범위·시간을 바꾸지 않는다. 분량·범위를 바꾸려면 [계획 조정 상담]으로 간다.
 * ★ 원문을 쪽으로 열 수 있으면(PDF) 그 쪽으로, 아니면 파일을 열고 확인할 위치를 글로 적는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, LifeBuoy, X } from 'lucide-react';
import { executionItemAPI } from '../../api/api.js';
import ExecutionRow from '../../components/ExecutionRow.jsx';
import MaterialFileLink from '../../components/MaterialFileLink.jsx';
import PlanItemDetail from '../plan/PlanItemDetail.jsx';
import ExecutionItemEvidence from '../plan/ExecutionItemEvidence.jsx';
import { actionOf, doneCriteriaOf, startSourceLine } from '../../lib/planItemText.js';
import { BLOCKER_LABEL, SUPPORT_LABEL, SUPPORT_OPTIONS } from '../../lib/recordLabels.js';
import { ItemWorkspaceContext } from './itemWorkspaceContext.js';
import '../../styles/item-workspace.css';

const OUTCOME_LABEL = { COMPLETED: '완료', PARTIAL: '일부 수행', NOT_DONE: '진행 없음' };

function Section({ title, open, onToggle, children, id }) {
  return (
    <section className="iw-section">
      <button type="button" className="iw-section-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {title}
      </button>
      {open && <div id={id} className="iw-section-body">{children}</div>}
    </section>
  );
}

export default function ItemWorkspace({ executionItemId, onClose, onChanged, onAskAi }) {
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({ steps: false, evidence: false, help: false, records: false });
  const [busy, setBusy] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpError, setHelpError] = useState(null);
  const ticket = useRef(0);
  const headingRef = useRef(null);

  const load = useCallback(async () => {
    const mine = ticket.current + 1;
    ticket.current = mine;
    setLoading(true);
    setError(null);
    try {
      const loaded = await executionItemAPI.workspace(executionItemId);
      if (ticket.current === mine) setWs(loaded);
    } catch (err) {
      if (ticket.current === mine) setError(err.message || '항목을 불러오지 못했어요.');
    } finally {
      if (ticket.current === mine) setLoading(false);
    }
  }, [executionItemId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { headingRef.current?.focus?.(); }, [ws?.item?.executionItemId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  /** 기록·이동 같은 행동은 목록 화면과 같은 API를 쓴다. 성공하면 작업 공간과 다른 화면을 함께 다시 읽는다. */
  const handleAction = async (action, item, payload) => {
    setBusy(true);
    try {
      if (action === 'complete') await executionItemAPI.complete(item.executionItemId, item.version, payload ?? {});
      else if (action === 'partial') await executionItemAPI.partial(item.executionItemId, { version: item.version, ...payload });
      else if (action === 'reduce') await executionItemAPI.reduce(item.executionItemId, { version: item.version, ...payload });
      else if (action === 'move') {
        await executionItemAPI.move(item.executionItemId, payload.toDate, item.version, {
          startTime: payload.startTime ?? null, endTime: payload.endTime ?? null,
        });
      } else if (action === 'resume') await executionItemAPI.resume(item.executionItemId, item.version);
      else if (action === 'delete') {
        await executionItemAPI.delete(item.executionItemId, item.version);
        onChanged?.();
        onClose?.();
        return { ok: true };
      }
      await load();
      onChanged?.();
      if (action === 'complete' || action === 'partial') setOpen((prev) => ({ ...prev, records: true }));
      return { ok: true };
    } catch (err) {
      return { ok: false, code: err.code ?? null, message: err.message ?? null };
    } finally {
      setBusy(false);
    }
  };

  const requestHelp = async (kind) => {
    if (helpBusy) return;
    setHelpBusy(true);
    setHelpError(null);
    try {
      const help = await executionItemAPI.requestStartHelp(executionItemId, kind, helpText.trim() || null);
      setWs((prev) => (prev ? { ...prev, startHelp: help } : prev));
      setHelpText('');
    } catch (err) {
      setHelpError(err.message || '도움을 만들지 못했어요. 첫 행동과 자료 위치는 위에 그대로 있어요.');
    } finally {
      setHelpBusy(false);
    }
  };

  const item = ws?.item;
  const action = item ? actionOf(item.description, ws.doneCriteria) : null;
  const done = item ? doneCriteriaOf(item.description, ws.doneCriteria) : null;
  const help = ws?.startHelp && !ws.startHelp.stale ? ws.startHelp : null;
  const staleHelp = ws?.startHelp?.stale ? ws.startHelp : null;
  const start = ws?.startSource ?? null;

  return (
    <div className="iw-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <aside className="iw-sheet" role="dialog" aria-modal="true" aria-labelledby="iw-title">
        <header className="iw-head">
          <div className="iw-head-text">
            <p className="iw-kicker">
              {[ws?.courseTitle, ws?.topicTitle].filter(Boolean).join(' · ') || '실행 항목'}
            </p>
            <h2 id="iw-title" className="iw-title" tabIndex={-1} ref={headingRef}>
              {item?.title ?? (loading ? '불러오는 중…' : '항목')}
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><X size={16} /></button>
        </header>

        <div className="iw-body" aria-busy={loading}>
          {error && !ws && (
            <p className="error-text">
              {error} <button type="button" className="btn-ghost btn-sm" onClick={load}>다시 시도</button>
            </p>
          )}

          {item && (
            <>
              <dl className="iw-core">
                <div>
                  <dt>첫 행동</dt>
                  <dd>
                    {help ? help.firstAction : (action ?? '항목에 적힌 행동이 없어요. 제목의 활동부터 시작해 보세요.')}
                    {help && <span className="iw-tag">시작 도움</span>}
                  </dd>
                </div>
                <div>
                  <dt>시작 자료</dt>
                  <dd>
                    {start ? (
                      <>
                        <span>{startSourceLine(start)}</span>
                        {start.state === 'AVAILABLE' && (
                          <MaterialFileLink materialId={start.materialId} filename={start.filename}
                            contentType={start.contentType} page={start.page ?? undefined}
                            label={start.page ? `p.${start.page} 열기` : '파일 열고 위치 확인'} />
                        )}
                        {start.state === 'AVAILABLE' && !start.page && start.locator && (
                          <span className="hint iw-hint">이 형식은 위치로 바로 이동하지 못해요. 파일에서 {start.locator}를 찾아 주세요.</span>
                        )}
                        {start.task && <span className="hint iw-hint">자료의 할 일: {start.task}</span>}
                      </>
                    ) : (
                      <span className="hint">
                        {ws.proposalItemId ? '이 항목이 인용한 자료 구간이 없어요.' : '직접 만든 항목이라 연결된 자료가 없어요.'}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>완료 기준</dt>
                  <dd>{done ?? <span className="hint">완료 기준이 적혀 있지 않아요. 스스로 확인할 기준을 메모로 남겨 두세요.</span>}</dd>
                </div>
              </dl>

              {ws.changedSinceDraft && (
                <p className="hint iw-notice">
                  계획을 적용한 뒤 이 항목의 제목·설명이 바뀌었어요(줄이기·남은 분량). 안내는 처음 항목을 기준으로 해요.
                </p>
              )}
              {ws.leftoverOfId && <p className="hint iw-notice">앞에서 일부 한 뒤 남은 분량이에요. 지난 기록과 메모가 이어져요.</p>}

              {/* 기록·이동은 목록과 같은 줄을 쓴다. 여기서 다시 작업 공간을 열 필요는 없다. */}
              <ItemWorkspaceContext.Provider value={null}>
                <ExecutionRow item={item} projectTitle={null} onAction={handleAction} busy={busy} compact hideEvidence />
              </ItemWorkspaceContext.Provider>

              <Section id="iw-steps" title="단계별 안내 · 내 메모" open={open.steps} onToggle={() => toggle('steps')}>
                {ws.proposalItemId ? (
                  <PlanItemDetail mode="item" id={item.executionItemId} expanded={open.steps} />
                ) : (
                  <p className="hint">직접 만든 항목에는 자료를 근거로 한 단계 안내가 없어요. 필요하면 아래 [시작 도움]을 받아 보세요.</p>
                )}
              </Section>

              <Section id="iw-help" title="시작 도움" open={open.help} onToggle={() => toggle('help')}>
                <p className="hint">첫 행동을 더 작고 구체적으로 풀어 줘요. 항목의 범위·시간은 바뀌지 않아요.</p>
                {help && <HelpCard help={help} onAskAi={onAskAi} item={item} />}
                {staleHelp && (
                  <div className="iw-help-stale">
                    <p className="hint">예전 안내예요 — 그 뒤에 항목이나 자료가 바뀌었어요.</p>
                    <HelpCard help={staleHelp} onAskAi={onAskAi} item={item} />
                  </div>
                )}
                <div className="iw-help-ask">
                  <input type="text" aria-label="어디가 막막한지 (선택)" placeholder="어디가 막막한지 (선택)"
                    maxLength={500} value={helpText} onChange={(e) => setHelpText(e.target.value)} disabled={helpBusy} />
                  <button type="button" className="btn-primary btn-sm" disabled={helpBusy} onClick={() => requestHelp('WHERE_TO_START')}>
                    <LifeBuoy size={13} /> {helpBusy ? '만드는 중…' : '어디서 시작할지 모르겠어요'}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" disabled={helpBusy} onClick={() => requestHelp('TOO_BIG')}>
                    너무 커요
                  </button>
                </div>
                {helpError && <p className="error-text">{helpError}</p>}
              </Section>

              <Section id="iw-evidence" title="왜 이 항목인가 · 원문 근거" open={open.evidence} onToggle={() => toggle('evidence')}>
                <ExecutionItemEvidence executionItemId={item.executionItemId} version={item.version} />
              </Section>

              <Section id="iw-records" title={`지난 기록 ${ws.records?.length ? `${ws.records.length}건` : ''}`}
                open={open.records} onToggle={() => toggle('records')}>
                {(ws.records ?? []).length === 0 ? (
                  <p className="hint">아직 기록이 없어요. 기록이 없다고 모른다는 뜻은 아니에요.</p>
                ) : (
                  <ul className="iw-records">
                    {ws.records.map((r) => <RecordLine key={r.executionRecordId} record={r} onSaved={load} />)}
                  </ul>
                )}
                {(ws.records ?? []).some((r) => r.supportLevel === 'GUIDED' || r.stuckStep) && onAskAi && (
                  <p className="iw-adjust">
                    이 결과로 다음 계획을 조정할 수 있어요. 지금 계획은 저절로 바뀌지 않아요.
                    <button type="button" className="btn-ghost btn-sm"
                      onClick={() => onAskAi(`「${item.title}」를 해 본 결과를 반영해서 이 부분의 설명·연습·분량 조정안을 만들어 줘. 과목 전체를 다시 짜지는 말아 줘.`, item)}>
                      조정안 상담하기
                    </button>
                  </p>
                )}
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function HelpCard({ help, onAskAi, item }) {
  return (
    <div className="iw-help">
      <p><span className="iw-label">첫 행동</span>{help.firstAction}</p>
      {help.where && <p><span className="iw-label">자료</span>{help.where}</p>}
      {help.starter && (
        <div>
          <p><span className="iw-label">짧게 시작하기</span>{help.starter.title}{help.starter.minutes ? ` · ${help.starter.minutes}분` : ''}</p>
          <ol>{help.starter.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}
      {!help.grounded && <p className="hint">자료 원문 없이 항목 설명만으로 만든 안내예요.</p>}
      {help.scopeChangeRequested && (
        <p className="iw-adjust">
          분량·범위를 바꾸는 건 계획 조정이에요. 이 도움은 범위를 바꾸지 않았어요.
          {onAskAi && (
            <button type="button" className="btn-ghost btn-sm"
              onClick={() => onAskAi(`「${item.title}」의 분량이나 범위를 조정하고 싶어. 조정안을 보여 줘.`, item)}>
              계획 조정 상담하기
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** 기록 한 줄. "어떻게 했나"는 사용자 진술이라 여기서 고칠 수 있다(결과·분량은 그대로). */
function RecordLine({ record, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [support, setSupport] = useState(record.supportLevel ?? null);
  const [stuck, setStuck] = useState(record.stuckStep ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await executionItemAPI.updateRecordReflection(record.executionRecordId, {
        supportLevel: support, stuckStep: stuck.trim() || null, blockerKind: record.blockerKind ?? null, note: record.note ?? null,
      });
      setEditing(false);
      await onSaved?.();
    } catch (e) {
      setErr(e.message || '고치지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  const when = record.recordedAt ? String(record.recordedAt).slice(5, 16).replace('T', ' ') : '';
  return (
    <li className="iw-record">
      <p>
        <strong>{OUTCOME_LABEL[record.outcome] ?? record.outcome}</strong>
        {record.outcome === 'PARTIAL' && record.completionPercent ? ` ${record.completionPercent}%` : ''}
        {' · '}{record.actualMinutes ? `내가 적은 시간 ${record.actualMinutes}분` : '시간 미기록'}
        {when && <span className="hint"> · {when}</span>}
      </p>
      {!editing && (
        <p className="iw-record-how">
          {record.supportLevel ? SUPPORT_LABEL[record.supportLevel] : '어떻게 했는지 남기지 않음'}
          {record.stuckStep && <> · 막힌 단계: {record.stuckStep}</>}
          {record.blockerKind && <> · 걸린 점: {BLOCKER_LABEL[record.blockerKind]}</>}
          {record.note && <> · {record.note}</>}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(true)}>고치기</button>
        </p>
      )}
      {editing && (
        <div className="iw-record-edit">
          <div role="group" aria-label="어떻게 했나요">
            {SUPPORT_OPTIONS.map((o) => (
              <button key={o.level} type="button" className={`btn-ghost btn-sm${support === o.level ? ' is-active' : ''}`}
                aria-pressed={support === o.level} onClick={() => setSupport(support === o.level ? null : o.level)}>
                {o.label}
              </button>
            ))}
          </div>
          <input type="text" aria-label="막힌 단계" maxLength={300} value={stuck} onChange={(e) => setStuck(e.target.value)}
            placeholder="막힌 단계 (선택)" />
          <button type="button" className="btn-primary btn-sm" disabled={saving} onClick={save}>저장</button>
          <button type="button" className="btn-ghost btn-sm" disabled={saving} onClick={() => setEditing(false)}>취소</button>
          {err && <p className="error-text">{err}</p>}
        </div>
      )}
    </li>
  );
}
