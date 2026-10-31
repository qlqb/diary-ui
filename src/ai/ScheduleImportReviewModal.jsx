/**
 * 근무표 이미지에서 읽은 표를 검토하는 다이얼로그.
 *
 * 사람이 정해야 하는 것 셋만 묻는다 — 어느 줄이 나인지, 어느 주인지, 모르는 코드가 몇 시인지.
 * 나머지는 서버가 이미 계산해 왔다.
 *
 * ★ 여기서 시간을 계산하지 않는다. 미리보기에 뜨는 시각은 서버가 준 값(cells[].start/end)을
 * 그대로 쓰고, [가져오기]는 표 원문을 그대로 돌려보낸다. 화면이 계산하면 서버의 계산과
 * 두 벌이 되고, 달력에 들어가는 값은 둘 중 어느 쪽인지 모르게 된다.
 *
 * 오버레이 클릭으로 닫지 않는다(ProposalDialog와 같다). 코드 시간을 입력하다 바깥을 잘못
 * 누르면 십수 초 걸린 이미지 읽기가 통째로 날아간다.
 *
 * 전체 목록을 늘 보여준다. 서버가 이름으로 한 줄을 미리 골라 두지만 그것은 선택일 뿐이고,
 * 근무표의 실명과 로그인 표시명은 다를 수 있다. 잘못 고르면 남의 근무가 내 달력에 들어온다.
 */

import { useMemo, useState } from 'react';
import { CalendarDays, Loader2, X } from 'lucide-react';
import { formatDateShort } from '../lib/datetime.js';

const WEEKDAY_LABEL = ['월', '화', '수', '목', '금', '토', '일'];

/** 서버가 준 날짜 문자열의 요일. Date 파싱은 여기서만 하고 시각 계산은 하지 않는다. */
function weekdayOf(isoDate) {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : WEEKDAY_LABEL[(date.getDay() + 6) % 7];
}

function cellText(cell) {
  if (cell.kind === 'OFF') return '휴무';
  if (cell.kind === 'UNRESOLVED') return cell.raw || '?';
  const end = cell.crossesMidnight ? `${cell.end} (다음 날)` : cell.end;
  return `${cell.start} ~ ${end}`;
}

export default function ScheduleImportReviewModal({
  extraction, conversationId, onCancel, onConfirm,
}) {
  const rows = extraction?.rows ?? [];
  const [rowIndex, setRowIndex] = useState(
    extraction?.matchedRowIndex ?? (rows.length === 1 ? 0 : null),
  );
  const [startDate, setStartDate] = useState(extraction?.resolvedPeriod?.startDate ?? '');
  const [title, setTitle] = useState('근무');
  const [legendOverrides, setLegendOverrides] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const selected = rowIndex == null ? null : rows[rowIndex];

  /**
   * 아직 시간을 모르는 코드. 고른 줄에 있는 것만 묻는다 — 남의 줄에 있는 코드까지 물으면
   * 사용자는 자기와 상관없는 칸을 채우게 된다.
   */
  const askingCodes = useMemo(() => {
    if (!selected || selected.rowInvalid) return [];
    return [...new Set(
      selected.cells.filter((c) => c.kind === 'UNRESOLVED').map((c) => c.raw).filter(Boolean),
    )];
  }, [selected]);

  const answered = askingCodes.every((code) => (legendOverrides[code] ?? '').trim());
  const canSubmit = selected && !selected.rowInvalid && startDate && title.trim()
    && answered && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        conversationId,
        // ★ 표 원문 그대로. 해석 결과는 보내지 않는다.
        raw: extraction.raw,
        rowIndex,
        periodStartDate: startDate,
        title: title.trim(),
        legendOverrides: Object.fromEntries(
          askingCodes.map((code) => [code, legendOverrides[code].trim()]),
        ),
      });
    } catch (err) {
      setError(err.message || '조금 뒤에 다시 시도해 주세요.');
      setSubmitting(false);
    }
  };

  return (
    <div className="schedule-import-backdrop" role="dialog" aria-modal="true"
      aria-label="이미지에서 일정 가져오기">
      <div className="schedule-import-modal">
        <div className="schedule-import-head">
          <h3><CalendarDays size={15} /> 표에서 읽은 내용</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel} aria-label="닫기">
            <X size={14} />
          </button>
        </div>

        {extraction?.raw?.title && (
          <p className="schedule-import-caption">{extraction.raw.title}</p>
        )}

        <label className="inline-field">
          <span>어느 줄이 나인가요</span>
          <select
            aria-label="내 줄"
            value={rowIndex ?? ''}
            onChange={(e) => setRowIndex(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">고르기</option>
            {rows.map((row) => (
              <option key={row.index} value={row.index} disabled={row.rowInvalid}>
                {row.name || `${row.index + 1}번째 줄`}{row.tag ? ` · ${row.tag}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-field">
          <span>첫 칸의 날짜</span>
          <input type="date" aria-label="첫 칸의 날짜" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} />
        </label>
        {extraction?.periodWeekdayMismatch && (
          <p className="schedule-import-note">
            표에 적힌 날짜와 첫 칸의 요일이 서로 다릅니다. 어느 주인지 한 번 봐 주세요.
          </p>
        )}
        {extraction?.periodMissing && (
          <p className="schedule-import-note">표에 날짜가 없어서 첫 칸의 날짜를 골라야 합니다.</p>
        )}

        <label className="inline-field">
          <span>일정 이름</span>
          <input aria-label="일정 이름" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        {askingCodes.length > 0 && (
          <div className="schedule-import-codes">
            <p className="schedule-import-note">
              표에 뜻이 적혀 있지 않은 표기가 있습니다. 몇 시인지 알려주시면 같이 넣을게요.
            </p>
            {askingCodes.map((code) => (
              <label key={code} className="inline-field">
                <span>{code}</span>
                <input
                  aria-label={`${code} 시간`}
                  placeholder="예: 10~15"
                  value={legendOverrides[code] ?? ''}
                  onChange={(e) => setLegendOverrides((prev) => ({ ...prev, [code]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        )}

        {selected && !selected.rowInvalid && (
          <ul className="schedule-import-preview">
            {selected.cells.map((cell, i) => (
              <li key={cell.date ?? i} className={cell.kind === 'OFF' ? 'is-off' : ''}>
                <span className="schedule-import-day">
                  {cell.date ? `${formatDateShort(cell.date)} (${weekdayOf(cell.date)})` : '—'}
                </span>
                <span>{cellText(cell)}</span>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="ai-error">{error}</p>}

        <div className="schedule-import-actions">
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={submitting}>
            나중에 하기
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={submit} disabled={!canSubmit}>
            {submitting ? <Loader2 size={13} className="spin" /> : null} 가져오기
          </button>
        </div>
      </div>
    </div>
  );
}
