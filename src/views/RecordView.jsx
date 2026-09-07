/**
 * 기록 = 실제로 무슨 일이 있었는지.
 *
 * 계획이 아니라 결과(execution_records)를 본다. 완료뿐 아니라 "일부만 했다"도 그대로 남는다 —
 * 완료율로 사람을 평가하지 않기 위해서다. 여기 쌓인 것이 다음 AI 판단의 근거가 된다.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleSlash, MinusCircle } from 'lucide-react';
import { executionItemAPI } from '../api/api.js';
import { formatDateKo, formatMinutes, shiftDate, todayString } from '../lib/datetime.js';

const RANGES = [
  { key: 7, label: '최근 7일' },
  { key: 30, label: '최근 30일' },
];

const OUTCOME = {
  COMPLETED: { label: '완료', icon: CheckCircle2, className: 'outcome-done' },
  PARTIAL: { label: '일부 했음', icon: MinusCircle, className: 'outcome-partial' },
  NOT_DONE: { label: '못 했음', icon: CircleSlash, className: 'outcome-none' },
};

export default function RecordView({ projectTitles, refreshToken }) {
  const [days, setDays] = useState(7);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const today = todayString();
    setLoading(true);
    setError(null);
    executionItemAPI.getRecords(shiftDate(today, -(days - 1)), today)
      .then((data) => { if (!cancelled) setRecords(data ?? []); })
      .catch((err) => { if (!cancelled) setError(err.message || '기록을 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days, refreshToken]);

  const totalMinutes = records.reduce((sum, r) => sum + (r.actualMinutes ?? 0), 0);
  const byDate = records.reduce((acc, record) => {
    const key = (record.recordedAt ?? '').slice(0, 10) || record.scheduledDate || '날짜 없음';
    (acc[key] ??= []).push(record);
    return acc;
  }, {});

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1 className="view-title">기록</h1>
          <p className="view-sub">
            실제로 무슨 일이 있었을까? · {records.length}건
            {totalMinutes > 0 && ` · 기록된 시간 ${formatMinutes(totalMinutes)}`}
          </p>
        </div>
        <div className="week-nav">
          {RANGES.map((range) => (
            <button
              key={range.key}
              type="button"
              className={`btn-ghost btn-sm${days === range.key ? ' is-selected' : ''}`}
              onClick={() => setDays(range.key)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </header>

      {error && <p className="view-error">{error}</p>}
      {loading && <p className="view-dim">불러오는 중...</p>}

      {!loading && !error && records.length === 0 && (
        <div className="empty-block">
          <p className="empty-title">아직 기록이 없어요</p>
          <p className="empty-desc">오늘 화면에서 완료하거나 &quot;일부 했어요&quot;를 남기면 여기에 쌓여요.</p>
        </div>
      )}

      {Object.entries(byDate).map(([date, dayRecords]) => (
        <section className="view-section" key={date}>
          <h2 className="section-title">{formatDateKo(date)}</h2>
          <div className="row-list">
            {dayRecords.map((record) => {
              const outcome = OUTCOME[record.outcome] ?? OUTCOME.NOT_DONE;
              const Icon = outcome.icon;
              return (
                <article className={`record-row ${outcome.className}`} key={record.executionRecordId}>
                  <Icon size={16} />
                  <div className="record-row-main">
                    <span className="record-row-title">{record.title ?? '계획 밖에서 한 일'}</span>
                    <span className="record-row-meta">
                      <span className="chip">{outcome.label}</span>
                      {record.completionPercent != null && record.outcome === 'PARTIAL' && (
                        <span className="chip">{record.completionPercent}%</span>
                      )}
                      {record.actualMinutes != null && <span className="chip">{formatMinutes(record.actualMinutes)}</span>}
                      {record.courseId && projectTitles?.[record.courseId] && (
                        <span className="chip chip-project">{projectTitles[record.courseId]}</span>
                      )}
                    </span>
                    {record.note && <p className="record-row-note">{record.note}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
