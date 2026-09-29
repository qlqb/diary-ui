/**
 * 학습 구조 직접 조정 — 고른 항목에 대해 드래그 없이 명시적 조작으로 변경을 모은다.
 *
 * 여기서 바로 바뀌는 것은 없다. 모은 변경은 [검토로 보내기]로 정리안에 더해지고, 아래 정리 구역에서 전후 구조·걸린 기록을
 * 본 뒤 고른 것만 적용된다(제외·제목 고치기·충돌 감지는 정리안이 맡는다).
 *
 * 네 가지를 섞지 않는다:
 *   교재 구조(부모·순서)      이름 바꾸기 · 위/아래 · 다른 항목 아래로 · 합치기 · 나누기
 *   실제 수업                 몇 주차에 다뤘는지 · 어느 항목 다음에 다뤘는지 — 교재 구조는 그대로
 *   이번 시험·계획 범위        범위에서 빼기 — 학습 완료가 아니다
 */

import { useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { structureAPI } from '../../api/api.js';

import '../../styles/learning-flow.css';
const WEEKS = Array.from({ length: 16 }, (_, i) => i + 1);

export default function StructureEditor({ courseId, topic, topics, onSent }) {
  const [pending, setPending] = useState([]);
  const [rename, setRename] = useState('');
  const [parentId, setParentId] = useState('');
  const [mergeWith, setMergeWith] = useState('');
  const [splitText, setSplitText] = useState('');
  const [week, setWeek] = useState('');
  const [classAfter, setClassAfter] = useState('');
  const [scopeLabel, setScopeLabel] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const byId = useMemo(() => new Map(topics.map((t) => [t.topicId, t])), [topics]);
  const siblings = useMemo(
    () => topics.filter((t) => (t.parentTopicId ?? null) === (topic.parentTopicId ?? null)),
    [topics, topic],
  );
  const index = siblings.findIndex((t) => t.topicId === topic.topicId);
  const descendants = useMemo(() => {
    const out = new Set([topic.topicId]);
    let grew = true;
    while (grew) {
      grew = false;
      topics.forEach((t) => {
        if (t.parentTopicId != null && out.has(t.parentTopicId) && !out.has(t.topicId)) {
          out.add(t.topicId);
          grew = true;
        }
      });
    }
    return out;
  }, [topics, topic]);
  const others = topics.filter((t) => t.topicId !== topic.topicId);

  const add = (op, text) => setPending((prev) => [...prev, { op, text }]);
  const base = { topicId: topic.topicId };

  const moveTo = (parent, after, text) => add({ op: 'MOVE', ...base, parentTopicId: parent, afterTopicId: after,
    reason: text }, text);

  const send = async () => {
    if (pending.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const result = await structureAPI.manual(courseId, pending.map((p) => p.op), '직접 조정');
      setPending([]);
      await onSent?.(result);
    } catch (err) {
      setError(err.message || '검토로 보내지 못했어요.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="structure-editor" aria-label={`${topic.title} 구조 조정`}>
      <h3 className="structure-editor-title">구조 조정 <span className="view-sub-dim">— 보내기 전에는 아무것도 바뀌지 않아요</span></h3>

      <fieldset className="structure-editor-group">
        <legend>교재 구조</legend>
        <div className="structure-editor-row">
          <input className="input" aria-label="새 이름" placeholder="새 이름" value={rename}
            onChange={(e) => setRename(e.target.value)} />
          <button type="button" className="btn-ghost btn-sm" disabled={!rename.trim()}
            onClick={() => { add({ op: 'RENAME', ...base, title: rename.trim(), reason: '이름 고침' }, `이름을 「${rename.trim()}」로`); setRename(''); }}>
            이름 바꾸기
          </button>
        </div>
        <div className="structure-editor-row">
          <button type="button" className="btn-ghost btn-sm" disabled={index <= 0}
            onClick={() => moveTo(topic.parentTopicId ?? null, index >= 2 ? siblings[index - 2].topicId : 0, '한 칸 위로')}>
            위로
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={index < 0 || index >= siblings.length - 1}
            onClick={() => moveTo(topic.parentTopicId ?? null, siblings[index + 1]?.topicId, '한 칸 아래로')}>
            아래로
          </button>
          <select aria-label="옮길 부모" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">다른 항목 아래로…</option>
            <option value="root">맨 위 단계</option>
            {others.filter((t) => !descendants.has(t.topicId)).map((t) => (
              <option key={t.topicId} value={t.topicId}>{t.title}</option>
            ))}
          </select>
          <button type="button" className="btn-ghost btn-sm" disabled={!parentId}
            onClick={() => {
              const parent = parentId === 'root' ? null : Number(parentId);
              moveTo(parent, null, parent == null ? '맨 위 단계로' : `「${byId.get(parent)?.title}」 아래로`);
              setParentId('');
            }}>
            옮기기
          </button>
        </div>
        <div className="structure-editor-row">
          <select aria-label="같은 내용인 항목" value={mergeWith} onChange={(e) => setMergeWith(e.target.value)}>
            <option value="">같은 내용인 항목과 합치기…</option>
            {others.filter((t) => !descendants.has(t.topicId)).map((t) => (
              <option key={t.topicId} value={t.topicId}>{t.title}</option>
            ))}
          </select>
          <button type="button" className="btn-ghost btn-sm" disabled={!mergeWith}
            onClick={() => {
              const other = Number(mergeWith);
              add({ op: 'MERGE', survivingTopicId: topic.topicId, absorbedTopicIds: [other],
                reason: '같은 내용이라 합침' }, `「${byId.get(other)?.title}」을 이 항목에 합치기`);
              setMergeWith('');
            }}>
            합치기
          </button>
        </div>
        <div className="structure-editor-row">
          <textarea className="input" rows={2} aria-label="나눌 하위 항목 제목(한 줄에 하나)"
            placeholder="나눌 하위 항목 제목(한 줄에 하나, 둘 이상)" value={splitText}
            onChange={(e) => setSplitText(e.target.value)} />
          <button type="button" className="btn-ghost btn-sm"
            disabled={splitText.split('\n').filter((l) => l.trim()).length < 2}
            onClick={() => {
              const titles = splitText.split('\n').map((l) => l.trim()).filter(Boolean);
              add({ op: 'SPLIT', ...base, children: titles.map((title, i) => ({ tempId: `u${Date.now()}-${i}`, title, sourceType: 'AI_DERIVED' })),
                reason: '너무 넓어 나눔' }, `${titles.length}개로 나누기: ${titles.join(', ')}`);
              setSplitText('');
            }}>
            나누기
          </button>
        </div>
      </fieldset>

      <fieldset className="structure-editor-group">
        <legend>실제 수업 <span className="view-sub-dim">(교재 구조는 그대로)</span></legend>
        <div className="structure-editor-row">
          <select aria-label="실제로 다룬 주차" value={week} onChange={(e) => setWeek(e.target.value)}>
            <option value="">몇 주차에 다뤘나요…</option>
            {WEEKS.map((w) => <option key={w} value={w}>{w}주차</option>)}
          </select>
          <select aria-label="바로 앞에 다룬 항목" value={classAfter} onChange={(e) => setClassAfter(e.target.value)}>
            <option value="">바로 앞에 다룬 항목…(선택)</option>
            <option value="0">가장 먼저 다룸</option>
            {others.map((t) => <option key={t.topicId} value={t.topicId}>{t.title} 다음</option>)}
          </select>
          <button type="button" className="btn-ghost btn-sm" disabled={!week && classAfter === ''}
            onClick={() => {
              const after = classAfter === '' ? null : Number(classAfter);
              add({ op: 'CLASS', ...base, week: week ? Number(week) : null, afterTopicId: after, reason: '실제 수업 정정' },
                [week ? `${week}주차에 다룸` : null,
                  after === 0 ? '가장 먼저 다룸' : after ? `「${byId.get(after)?.title}」 다음에 다룸` : null].filter(Boolean).join(' · '));
              setWeek('');
              setClassAfter('');
            }}>
            기록
          </button>
        </div>
      </fieldset>

      <fieldset className="structure-editor-group">
        <legend>시험·계획 범위</legend>
        <div className="structure-editor-row">
          <input className="input" aria-label="어느 시험·계획" placeholder="예: 중간고사 (비우면 이번 계획)" maxLength={60}
            value={scopeLabel} onChange={(e) => setScopeLabel(e.target.value)} />
          <button type="button" className="btn-ghost btn-sm"
            onClick={() => { add({ op: 'SCOPE_EXCLUDE', ...base, label: scopeLabel.trim() || null, reason: '범위에서 뺌' },
              `${scopeLabel.trim() || '이번 계획'} 범위에서 빼기(완료로 보지 않음)`); setScopeLabel(''); }}>
            범위에서 빼기
          </button>
        </div>
      </fieldset>

      {pending.length > 0 && (
        <div className="structure-editor-pending">
          <p className="structure-editor-pending-head">보낼 변경 {pending.length}개 · 「{topic.title}」</p>
          <ul>
            {pending.map((p, i) => (
              <li key={i}>
                {p.text}
                <button type="button" className="icon-btn" aria-label={`${p.text} 빼기`}
                  onClick={() => setPending((prev) => prev.filter((_, j) => j !== i))}>
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary btn-sm" disabled={sending} onClick={send}>
            {sending ? <Loader2 size={13} className="spin" /> : null} 검토로 보내기
          </button>
          <span className="view-sub-dim"> 아래 정리 구역에서 전후 구조를 보고 적용해요.</span>
        </div>
      )}
      {error && <p className="view-error">{error}</p>}
    </section>
  );
}
