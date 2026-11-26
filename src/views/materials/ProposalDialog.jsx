/**
 * 프로젝트 연결 제안 창 — "AI 추천대로 한 번에, 틀린 것만 그 줄에서".
 *
 * (2026-11-21) 묶음 카드 중심이던 창을 파일 중심으로 바꿨다(샌드박스 proposal-sandbox에서 다섯 안을 비교해 고른 안).
 * - 맨 위 요약 줄이 곧 결과다: 어디로 몇 개, 확인 필요 몇 개, 그냥 둠 몇 개. 확신 있는 추천은 처음부터 켜져 있어
 *   [추천대로 N개 연결] 한 번으로 끝낼 수 있다.
 * - AI가 자신 없는 파일만 "확인해 주세요"로 위에 모은다. 고르기([추천대로] 또는 다른 곳) 전에는 연결에 넣지 않는다.
 * - 파일마다 넣을 곳 칩이 있고, 칩 → 고르기 두 번이면 그 파일만 다른 곳으로 간다. 바꾼 줄은 제자리에 남고 "AI 추천: … 되돌리기".
 *   추천 그대로인 칩은 흐리게 둬서 바꾼 줄만 눈에 띈다.
 * - 새 프로젝트는 메뉴 안에서 이름부터 정한다(같은 이름의 기존 프로젝트가 있으면 거기에 넣기를 먼저 권한다).
 *   여러 파일을 같은 곳(새 프로젝트 포함)으로 옮길 때는 [여러 개 고르기] 선택 모드를 쓴다 — 평소의 체크는 "연결에 넣기"라 분리했다.
 * - 따로 나누기·따로 옮기기·원래 묶음으로 같은 묶음 조작은 없앴다. 파일마다 넣을 곳을 고르면 묶음은 결과일 뿐이다.
 *
 * 그대로 지키는 것
 * - 오버레이 클릭으로 닫지 않는다. `나중에 하기`와 `×`(그리고 편집 중이 아닐 때 Esc)만 닫는다.
 * - 판단하지 못한 자료(LEAVE)를 숨기지 않는다 — 접힌 칸으로 보여 준다.
 * - 적용은 원자적이다. 서버는 이 요청을 그대로 믿지 않고 소유권·상태·미연결 여부를 다시 확인한다.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, FileText, Info, ListChecks, Loader2, PauseCircle, RotateCcw, X } from 'lucide-react';
import { ActionIcon, Button, Checkbox } from '@mantine/core';
import MaterialFileLink from '../../components/MaterialFileLink.jsx';
import { LEAVE, evidenceText, recommendedKey } from '../../lib/linkProposal.js';
import { useLinkProposalReview } from './useLinkProposalReview.js';
import { DestChip, DestMenu, NewProjectChip, RoleSelect } from './ProposalDestMenu.jsx';
import '../../styles/link-proposal.css';

export default function ProposalDialog({
  proposal,
  projects = [],
  onApplied,
  onClose,
  onShowRemaining,
  loading = false,
}) {
  const review = useLinkProposalReview({ proposal, projects, onApplied });
  const [openWhy, setOpenWhy] = useState({});
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState({});
  const busy = review.applying || loading;
  const remaining = proposal.remainingMaterialIds ?? [];
  const pickedFiles = review.files.filter((f) => picked[f.id]);
  const togglePick = (id) => setPicked((prev) => ({ ...prev, [id]: !prev[id] }));
  const stopSelecting = () => { setSelecting(false); setPicked({}); };

  const reviewFiles = review.files.filter((f) => f.review);
  const confidentGroups = review.groups.filter((g) => g.action !== 'LEAVE' && !review.files.find((f) => f.group === g)?.review);
  const leaveFiles = review.files.filter((f) => f.group.action === 'LEAVE');

  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  /* 열리면 제목에 포커스. 첫 체크박스에 주지 않는다 — 스페이스를 잘못 누르면 선택이 바뀐다. */
  useEffect(() => { titleRef.current?.focus(); }, []);
  /* body 스크롤 잠금. 복원을 cleanup에 둬서 어떤 경로로 닫혀도 잠긴 채 남지 않는다. */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      // 메뉴·이름 칸 안의 Esc는 그것만 닫는다(메뉴는 포털이라 React 이벤트가 여기까지 올라온다).
      const el = e.target;
      if (el?.closest?.('[role="menu"], .mantine-Popover-dropdown')) return;
      e.stopPropagation();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName)) { el.blur(); return; }
      if (selecting) { stopSelecting(); return; }
      if (!busy) onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="-1"][data-focus-start]');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const renderRow = (file, { reviewRow = false } = {}) => {
    const { member, id } = file;
    const changed = review.changed(file);
    const waiting = reviewRow && review.waiting(file);
    const isPicked = !!picked[id];
    return (
      <li key={id}
        className={`lp-row${changed ? ' is-changed' : ''}${waiting ? ' is-waiting' : ''}${selecting && isPicked ? ' is-picked' : ''}`}
        onClick={selecting ? () => togglePick(id) : undefined}>
        <span className="lp-check">
          {selecting ? (
            <Checkbox size="sm" checked={isPicked} aria-label={`${member.originalFilename} 고르기`}
              onClick={(e) => e.stopPropagation()} onChange={() => togglePick(id)} />
          ) : waiting ? (
            <AlertCircle size={16} className="lp-pending" aria-label="확인 전" />
          ) : (
            <Checkbox size="xs" checked={review.isActive(file)} disabled={review.dest[id] === LEAVE || busy}
              aria-label={`${member.originalFilename} 연결에 넣기`} onChange={(e) => review.setOn(file, e.target.checked)} />
          )}
        </span>
        <div className="lp-main">
          <button type="button" className="lp-name" title={member.originalFilename} aria-expanded={!!openWhy[id]}
            onClick={(e) => { if (selecting) return; e.stopPropagation(); setOpenWhy((p) => ({ ...p, [id]: !p[id] })); }}>
            <FileText size={14} aria-hidden="true" /><span>{member.originalFilename}</span>
          </button>
          {((reviewRow && file.review) || changed) && (
            <div className="lp-meta">
              {reviewRow && file.review && <span className="lp-reason"><AlertCircle size={12} aria-hidden="true" /> {file.review}</span>}
              {changed && (
                <span className="lp-changed">
                  AI 추천: {review.describe(file.recommended).label}
                  <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); review.reset(file); }}>
                    <RotateCcw size={11} aria-hidden="true" /> 되돌리기
                  </button>
                </span>
              )}
            </div>
          )}
          {openWhy[id] && !selecting && (
            <p className="lp-why"><Info size={12} aria-hidden="true" /> {evidenceText(member)}</p>
          )}
        </div>
        <div className="lp-side" onClick={(e) => { if (selecting) e.stopPropagation(); }}>
          <RoleSelect review={review} file={file} disabled={busy} />
          <DestChip review={review} file={file} disabled={busy || selecting} />
          {waiting && !selecting && (
            <Button size="compact-xs" variant="light" disabled={busy} onClick={() => review.accept(file)}>추천대로</Button>
          )}
          <MaterialFileLink materialId={id} filename={member.originalFilename} contentType={member.contentType}
            disabled={busy} iconOnly />
        </div>
      </li>
    );
  };

  const primaryLabel = review.changedCount === 0 && review.pending.length === 0
    ? `추천대로 ${review.active.length}개 연결`
    : `${review.active.length}개 연결하기`;
  const footNote = review.missingTitle ? '이름이 빈 새 프로젝트가 있어요. 위 요약에서 이름을 적어 주세요.'
    : review.clash ? `“${review.titles[review.clash.key]}”와 같은 이름의 프로젝트가 이미 있어요.`
      : review.pending.length > 0 ? `확인할 자료 ${review.pending.length}개는 고른 뒤에 함께 연결돼요.`
        : review.active.length === 0 ? '연결할 자료를 하나 이상 골라 주세요.'
          : review.changedCount > 0 ? `${review.changedCount}개를 AI 추천과 다르게 바꿨어요.` : '';

  return (
    <div className="proposal-dialog-overlay" role="presentation">
      <div className="proposal-dialog lp-dialog" role="dialog" aria-modal="true" aria-labelledby="lp-title"
        ref={dialogRef} onKeyDown={handleKeyDown}>
        <header className="lp-head">
          <div className="lp-head-top">
            <h2 id="lp-title" tabIndex={-1} data-focus-start ref={titleRef}>
              프로젝트 연결 제안 <span className="lp-count">{review.files.length}</span>
            </h2>
            <ActionIcon variant="subtle" color="gray" aria-label="제안 닫기" disabled={busy} onClick={onClose}><X size={16} /></ActionIcon>
          </div>
          <p className="lp-sub">AI가 고른 곳이 맞으면 그대로 연결하고, 다른 것만 그 줄에서 바꾸세요.</p>
          <div className="lp-summary" aria-label="연결 요약">
            {review.summary.map((s) => (s.kind === 'new'
              ? <NewProjectChip key={s.key} review={review} item={s} />
              : <span key={s.key} className="lp-chip">{s.label} <b>{s.count}</b></span>))}
            {review.pending.length > 0 && (
              <span className="lp-chip is-warn"><AlertCircle size={12} aria-hidden="true" /> 확인 필요 <b>{review.pending.length}</b></span>
            )}
            {review.leaveCount > 0 && <span className="lp-chip is-leave"><PauseCircle size={12} aria-hidden="true" /> 그냥 둠 <b>{review.leaveCount}</b></span>}
          </div>
        </header>

        {review.files.length > 1 && (
          <div className={`lp-bar${selecting ? ' is-on' : ''}`}>
            {selecting ? (
              <>
                <span className="lp-bar-count"><b>{pickedFiles.length}개</b> 선택됨</span>
                <DestMenu review={review} files={pickedFiles} bulk position="bottom-start" disabled={pickedFiles.length === 0}>
                  <Button size="compact-sm" disabled={pickedFiles.length === 0} rightSection={<ChevronDown size={13} />}>넣을 곳 바꾸기</Button>
                </DestMenu>
                <Button size="compact-sm" variant="default" disabled={pickedFiles.length === 0}
                  onClick={() => { review.chooseMany(pickedFiles, LEAVE); setPicked({}); }}>연결에서 빼기</Button>
                <span className="lp-bar-spacer" />
                <Button size="compact-sm" variant="subtle" onClick={stopSelecting}>완료</Button>
              </>
            ) : (
              <>
                <span className="lp-bar-hint">여러 자료를 같은 곳(새 프로젝트 포함)으로 옮기려면</span>
                <Button size="compact-sm" variant="subtle" disabled={busy} leftSection={<ListChecks size={14} />}
                  onClick={() => setSelecting(true)}>여러 개 고르기</Button>
              </>
            )}
          </div>
        )}

        <div className="lp-body">
          {review.files.length === leaveFiles.length && (
            <p className="view-dim lp-empty">지금은 묶어서 제안할 만한 게 없어요.</p>
          )}
          {reviewFiles.length > 0 && (
            <section className="lp-section is-review" aria-label="확인해 주세요">
              <h3 className="lp-section-title"><AlertCircle size={14} aria-hidden="true" /> 확인해 주세요
                <span className="lp-section-hint">AI가 자신 없는 자료예요. 고른 것만 연결돼요.</span></h3>
              <ul className="lp-list">{reviewFiles.map((f) => renderRow(f, { reviewRow: true }))}</ul>
            </section>
          )}
          {confidentGroups.map((g) => (
            <section key={g.groupId} className="lp-section" aria-label={`AI가 묶은 자료 ${review.describe(recommendedKey(g)).label}`}>
              <h3 className="lp-section-title"><span className="lp-section-from">AI가 묶은 자료</span>
                {review.describe(recommendedKey(g)).label}
                <span className="lp-section-count">{g.members.length}개</span>
                {g.reason && <span className="lp-section-hint" title={g.reason}>· {g.reason}</span>}</h3>
              <ul className="lp-list">{review.files.filter((f) => f.group === g).map((f) => renderRow(f))}</ul>
            </section>
          ))}
          {leaveFiles.length > 0 && (
            <section className="lp-section">
              <button type="button" className="lp-leave-toggle" aria-expanded={leaveOpen} onClick={() => setLeaveOpen((v) => !v)}>
                {leaveOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} 지금은 그냥 둘 자료 {leaveFiles.length}개
              </button>
              {leaveOpen && <ul className="lp-list">{leaveFiles.map((f) => renderRow(f))}</ul>}
            </section>
          )}
        </div>

        {review.error && <p className="view-error lp-error">{review.error}</p>}
        <footer className="lp-foot">
          <p className="lp-foot-note" role="status">{footNote}</p>
          {remaining.length > 0 && (
            <Button variant="default" size="xs" disabled={busy} onClick={() => onShowRemaining?.(remaining)}>
              남은 {remaining.length}개 보기
            </Button>
          )}
          <Button variant="default" size="xs" className="proposal-dialog-later" disabled={busy} onClick={onClose}>나중에 하기</Button>
          <Button size="xs" onClick={review.apply}
            disabled={busy || selecting || review.active.length === 0 || review.missingTitle}>
            {review.applying ? <><Loader2 size={13} className="spin" /> 연결하는 중</> : primaryLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
