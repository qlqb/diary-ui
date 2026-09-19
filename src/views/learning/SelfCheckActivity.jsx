/**
 * 점검 활동(선택). 고른 주제 묶음의 항목마다 "알아 / 애매해 / 처음 봐"를 남긴다.
 *
 * 시험이 아니다. 맞고 틀림이 없고, 답하지 않은 항목은 아예 보내지 않는다 — 비워 둔 것을
 * "모름"으로 저장하면 사용자가 하지 않은 말을 기록하게 된다. 저장해도 진도(완료)는 바뀌지 않고,
 * 다음 상담이 설명 깊이와 분량을 맞출 때만 읽는다.
 */

import { useMemo, useState } from 'react';
import { selfCheckAPI } from '../../api/api.js';
import { SELF_CHECK_LABEL, SELF_CHECK_LEVELS, selfCheckItemsOf } from './learningMapModel.js';

export default function SelfCheckActivity({ courseId, groups, onClose, onSubmitted }) {
  const [groupId, setGroupId] = useState(groups[0]?.topicId ?? null);
  const [answers, setAnswers] = useState({});
  const [skipped, setSkipped] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const group = groups.find((g) => g.topicId === groupId) ?? null;
  const items = useMemo(() => (group ? selfCheckItemsOf(group) : []), [group]);
  const visible = items.filter((it) => !skipped.has(it.key));
  const answered = visible.filter((it) => answers[it.key]?.level);

  const setAnswer = (key, patch) => setAnswers((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...patch } }));

  const submit = async () => {
    if (answered.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await selfCheckAPI.submit(courseId, answered.map((it) => ({
        key: it.key,
        label: it.label,
        topicId: it.topicId,
        sectionId: it.sectionId,
        level: answers[it.key].level,
        note: String(answers[it.key].note ?? '').trim() || null,
      })));
      await onSubmitted?.(answered.length);
    } catch (err) {
      setError(err?.status === 404
        ? '아직 이 기능을 쓸 수 없어요. 상담에서 직접 말해도 똑같이 반영돼요.'
        : (err.message || '저장하지 못했어요. 잠시 뒤 다시 해 주세요.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="lm-selfcheck" aria-label="점검 활동">
      <h3 className="lm-selfcheck-title">점검 활동 (선택)</h3>
      <p className="lm-selfcheck-desc">
        시험이 아니에요. 지금 느낌을 남기는 자기평가예요. 완료로 처리되지 않고, 다음 상담에서 설명 깊이와
        분량을 맞추는 데만 써요. 건너뛰어도 괜찮아요.
      </p>

      <label className="lm-selfcheck-group">
        <span>점검할 묶음</span>
        <select value={groupId ?? ''} disabled={busy}
          onChange={(e) => { setGroupId(Number(e.target.value)); setAnswers({}); setSkipped(new Set()); }}>
          {groups.map((g) => <option key={g.topicId} value={g.topicId}>{g.title}</option>)}
        </select>
      </label>

      {visible.length === 0 ? (
        <p className="view-dim">이 묶음에는 지금 물어볼 항목이 없어요.</p>
      ) : (
        <ul className="lm-selfcheck-list">
          {visible.map((it) => (
            <li key={it.key} className="lm-selfcheck-item">
              <fieldset disabled={busy}>
                <legend>{it.label}</legend>
                <div className="lm-selfcheck-levels">
                  {SELF_CHECK_LEVELS.map((level) => (
                    <label key={level} className="lm-selfcheck-level">
                      <input type="radio" name={`selfcheck-${it.key}`} value={level}
                        checked={answers[it.key]?.level === level}
                        onChange={() => setAnswer(it.key, { level })} />
                      <span>{SELF_CHECK_LABEL[level]}</span>
                    </label>
                  ))}
                  <button type="button" className="btn-ghost btn-sm"
                    aria-label={`${it.label} 건너뛰기`}
                    onClick={() => setSkipped((prev) => new Set(prev).add(it.key))}>
                    건너뛰기
                  </button>
                </div>
                <input type="text" className="lm-selfcheck-note" maxLength={300}
                  aria-label={`${it.label} 메모 (선택)`} placeholder="메모 (선택)"
                  value={answers[it.key]?.note ?? ''}
                  onChange={(e) => setAnswer(it.key, { note: e.target.value })} />
              </fieldset>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="view-error" role="alert">{error}</p>}

      <div className="lm-selfcheck-actions">
        <button type="button" className="btn-primary btn-sm" disabled={busy || answered.length === 0} onClick={submit}>
          {answered.length > 0 ? `${answered.length}개 자기평가 저장` : '자기평가 저장'}
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onClose}>
          이번엔 건너뛰기
        </button>
      </div>
    </section>
  );
}
