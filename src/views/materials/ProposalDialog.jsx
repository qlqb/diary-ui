/**
 * 자료 연결 제안 검토 다이얼로그.
 *
 * 목록 위에 펼쳐지던 카드를 화면 중앙 다이얼로그로 옮겼다. 이 작업은 원자적이다 —
 * 전부 보고 한 번에 승인하거나 전부 미루거나이지, 절반만 적용되는 상태가 없다.
 * 다이얼로그는 정확히 그런 작업에 쓰는 도구다. 인라인 확장은 "언제든 다른 걸 하다
 * 돌아올 수 있다"는 느낌을 주는데 실제로는 그렇지 않다.
 *
 * 우측 패널을 쓰지 않은 이유는 AI 상담 패널이 이미 그 자리를 쓰기 때문이다. 상호 배제를
 * 만들면 "검토하려면 상담이 닫힌다"가 되고, 사용자는 왜 닫혔는지 모른다.
 *
 * 오버레이 클릭으로 닫지 않는다. 제목을 편집하다 바깥을 잘못 누르면 작업이 통째로
 * 날아간다. `나중에 하기`와 `×`만 닫는다.
 *
 * 앱에서 세 번째 검토 카드다(MaterialReview, AI 패널 proposal 카드에 이어). 공통
 * 컴포넌트를 아직 뽑지 않는 것은 의도다 — 표본이 셋이 되어야 "같은 부분과 다른 부분"이
 * 코드로 드러나고, 그때 추출이 기계적인 작업이 된다. 대신 MaterialReview를 보면서
 * prop명·상태명·핸들러명을 의도적으로 맞춰 둔다.
 *
 * 세 카드가 공통으로 지키는 동작 규칙 중 여기서 특히 중요한 것:
 * - defaultSelected는 서버가 계산한다. 여기서 재계산하지 않는다.
 * - 판단하지 못한 자료를 숨기지 않는다 — LEAVE 묶음으로 보여준다.
 * - 적용은 원자적이다. 사용자가 승인한 단위는 화면에 보인 묶음 전체다.
 */

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, X, ChevronRight, AlertCircle, Scissors, Undo2 } from 'lucide-react';
import { materialStoreAPI } from '../../api/api.js';
import MaterialTypeSelect from '../../components/MaterialTypeSelect.jsx';
import { MaterialType, MATERIAL_TYPE_HINT } from '../../types/learning.js';

const ProposalAction = Object.freeze({
  LINK_EXISTING: 'LINK_EXISTING',
  CREATE_AND_LINK: 'CREATE_AND_LINK',
  LEAVE: 'LEAVE',
});

const EvidenceSource = Object.freeze({
  CONTENT: 'CONTENT',
  FILENAME_ONLY: 'FILENAME_ONLY',
});

/** 새로 만들기를 고른 상태. 실제 courseId와 섞이지 않게 문자열로 둔다. */
const CREATE_NEW = 'new';

/** 확장자를 뗀 파일명. 쪼갠 묶음의 제목은 여기서 나온다 — 추정값이라 기본 꺼짐이다. */
function titleFromFilename(filename) {
  const name = filename ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** 동명 비교. 서버의 동명 검사(§4.4)와 같은 기준 — 공백 제거, 대소문자 무시. */
function titleKey(title) {
  return (title ?? '').replace(/\s+/g, '').toLowerCase();
}

/**
 * 실패 프레이밍을 쓰지 않는다. "근거를 확인하지 못했다"는 자료의 결함이 아니라 제안의
 * 확신도이고, 사용자가 켜면 그만인 상태다.
 */
function memberNote(member) {
  if (member.evidenceSource === EvidenceSource.CONTENT && member.evidenceVerified) {
    return member.evidence;
  }
  if (member.evidenceSource === EvidenceSource.FILENAME_ONLY) {
    return '파일명만 보고 고른 이름이에요';
  }
  return '제안의 근거를 확인하지 못했어요';
}

/** 이 묶음이 어디로 가는지. 접힌 줄의 제목이자 라벨이다. */
function destinationTitle(group) {
  if (group.action === ProposalAction.LINK_EXISTING) return group.existingCourseTitle ?? '기존 프로젝트';
  return group.proposedTitle || '이름 없음';
}

/** 접힌 줄의 요약. 파일 개수를 여기서 말해야 한 줄에 여러 파일이 있다는 게 보인다. */
function summaryLine(group) {
  const files = `파일 ${group.members.length}개`;
  if (group.action === ProposalAction.LINK_EXISTING) {
    return `→ ${group.existingCourseTitle ?? '기존 프로젝트'} · ${files}`;
  }
  return `→ 새 프로젝트 · ${files}`;
}

export default function ProposalDialog({
  proposal,
  onApplied,
  onClose,
  onShowRemaining,
  loading = false,
}) {
  /**
   * 화면에서 편집 중인 묶음 목록. 서버 응답을 그대로 쓰지 않고 복사해 두는 이유는
   * `따로 나누기`가 묶음 구성 자체를 바꾸기 때문이다.
   *
   * 재요청이 아니라 수정인 것이 핵심이다. 잘못 묶였을 때 필요한 건 모델을 한 번 더 부르는
   * 것이 아니라 사용자가 그 자리에서 고치는 길이다.
   */
  const [workGroups, setWorkGroups] = useState(() => proposal.groups ?? []);

  const groups = proposal.groups ?? [];
  const actionable = workGroups.filter((g) => g.action !== ProposalAction.LEAVE);
  const leaveGroup = workGroups.find((g) => g.action === ProposalAction.LEAVE);
  const remaining = proposal.remainingMaterialIds ?? [];

  const [selected, setSelected] = useState(() =>
    Object.fromEntries(actionable.map((g) => [g.groupId, g.defaultSelected])));
  const [titles, setTitles] = useState(() =>
    Object.fromEntries(actionable.map((g) => [g.groupId, g.proposedTitle ?? ''])));
  const [destinations, setDestinations] = useState(() =>
    Object.fromEntries(actionable.map((g) => [g.groupId, CREATE_NEW])));
  const [types, setTypes] = useState(() =>
    Object.fromEntries(actionable.map((g) => [
      g.groupId,
      Object.fromEntries(g.members.map((m) => [m.materialId, m.materialType ?? MaterialType.OTHER])),
    ])));
  /*
    접힘 기본값. 체크가 꺼져 있거나 확인할 것이 붙은 묶음은 펼친 채로 둔다 — 그게 바로
    사용자가 봐야 하는 것들이고, 접어두면 못 보고 지나간다(v6 §11.3의 5번과 같은 이유).

    전부 잘 잡힌 날에는 모두 접혀서 여러 줄이 한 화면에 들어온다. 잘 안 잡히는 날이
    이 규칙의 시험대다.
  */
  const [expanded, setExpanded] = useState(() =>
    Object.fromEntries(actionable.map((g) => [
      g.groupId,
      !g.defaultSelected || (g.notices ?? []).length > 0,
    ])));
  /** 그룹별 `왜 이렇게 추천했나요?` 접기. */
  const [reasonOpen, setReasonOpen] = useState({});
  const selectAllRef = useRef(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  const totalCount = groups.reduce((sum, g) => sum + g.members.length, 0);
  const selectedGroups = actionable.filter((g) => selected[g.groupId]);

  const setType = (groupId, materialId, materialType) => {
    setTypes((prev) => ({ ...prev, [groupId]: { ...prev[groupId], [materialId]: materialType } }));
  };

  /**
   * 묶음을 멤버 수만큼의 새 프로젝트로 쪼갠다.
   *
   * 전부 체크 해제로 시작한다. 제목이 파일명에서 나온 추정값이므로 사용자가 하나씩 확인하고
   * 켜야 한다 — 근거가 약한 항목은 기본 꺼짐이라는 검토 카드 공통 규칙과 같은 이유다.
   *
   * evidenceSource는 건드리지 않는다. 그건 모델이 신고한 값이고, 여기서 사람이 바꾼 것은
   * 제목이지 근거가 아니다.
   */
  const splitGroup = (group) => {
    const parts = group.members.map((member) => ({
      groupId: `${group.groupId}-split-${member.materialId}`,
      action: ProposalAction.CREATE_AND_LINK,
      existingCourseId: null,
      existingCourseTitle: null,
      proposedTitle: titleFromFilename(member.originalFilename),
      reason: '',
      defaultSelected: false,
      notices: [],
      matchingProjects: [],
      members: [member],
      splitFrom: group,
    }));

    setSelected((prev) => ({
      ...prev,
      ...Object.fromEntries(parts.map((p) => [p.groupId, false])),
    }));
    // 쪼갠 묶음은 체크가 꺼진 채로 온다 — 확인이 필요한 것은 펼쳐 둔다는 규칙이 그대로 적용된다.
    setExpanded((prev) => ({
      ...prev,
      ...Object.fromEntries(parts.map((p) => [p.groupId, true])),
    }));
    setTitles((prev) => ({
      ...prev,
      ...Object.fromEntries(parts.map((p) => [p.groupId, p.proposedTitle])),
    }));
    setDestinations((prev) => ({
      ...prev,
      ...Object.fromEntries(parts.map((p) => [p.groupId, CREATE_NEW])),
    }));
    // 쪼개기 전에 사용자가 바꾼 역할을 그대로 물려받는다.
    setTypes((prev) => ({
      ...prev,
      ...Object.fromEntries(parts.map((p) => {
        const member = p.members[0];
        return [p.groupId, {
          [member.materialId]:
            prev[group.groupId]?.[member.materialId] ?? member.materialType ?? MaterialType.OTHER,
        }];
      })),
    }));

    setWorkGroups((prev) => {
      const index = prev.indexOf(group);
      if (index < 0) return prev;
      return [...prev.slice(0, index), ...parts, ...prev.slice(index + 1)];
    });
  };

  /**
   * 쪼갠 것을 되돌린다. 재요청이 모델 호출 한 번이라, 잘못 눌렀다고 호출을 한 번 더 쓸
   * 이유가 없다.
   */
  const undoSplit = (origin) => {
    setWorkGroups((prev) => {
      const index = prev.findIndex((g) => g.splitFrom === origin);
      if (index < 0) return prev;
      return [...prev.slice(0, index).filter((g) => g.splitFrom !== origin),
        origin,
        ...prev.slice(index).filter((g) => g.splitFrom !== origin)];
    });
  };

  /**
   * 사용자가 실제로 고친 값만 보낸다. 동명 경고에서 기존 프로젝트를 골랐으면 여기서
   * action 자체가 LINK_EXISTING으로 바뀐다 — 서버는 이 요청을 그대로 신뢰하지 않고
   * 소유권·상태·미연결 여부를 다시 확인한다.
   */
  const buildGroups = () => selectedGroups.map((group) => {
    const destination = destinations[group.groupId] ?? CREATE_NEW;
    const members = group.members.map((m) => ({
      materialId: m.materialId,
      materialType: types[group.groupId]?.[m.materialId] ?? MaterialType.OTHER,
    }));

    if (group.action === ProposalAction.CREATE_AND_LINK && destination !== CREATE_NEW) {
      return { action: ProposalAction.LINK_EXISTING, existingCourseId: destination, members };
    }
    if (group.action === ProposalAction.CREATE_AND_LINK) {
      return { action: ProposalAction.CREATE_AND_LINK, title: titles[group.groupId], members };
    }
    return { action: ProposalAction.LINK_EXISTING, existingCourseId: group.existingCourseId, members };
  });

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      await materialStoreAPI.applyLinkProposal(buildGroups());
      await onApplied?.();
    } catch (err) {
      setError(err.message || '적용하지 못했어요.');
    } finally {
      setApplying(false);
    }
  };

  const busy = applying || loading;

  /*
    전체 선택은 현재 상태를 반영하는 표시이지 기본값이 아니다. 처음부터 전부 켜놓지 않는다 —
    (4/6)처럼 숫자가 보이면 사용자가 "왜 2개는 꺼져 있지" 하고 확인하게 되고, 그게 의도다.
  */
  const selectedCount = selectedGroups.length;
  const allSelected = actionable.length > 0 && selectedCount === actionable.length;
  const noneSelected = selectedCount === 0;

  // React는 indeterminate를 JSX 속성으로 받지 않는다 — DOM에 직접 설정해야 한다.
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allSelected && !noneSelected;
    }
  }, [allSelected, noneSelected]);

  const toggleAll = () => {
    const next = !allSelected;
    setSelected(Object.fromEntries(actionable.map((g) => [g.groupId, next])));
  };

  const dialogRef = useRef(null);
  const titleRef = useRef(null);

  /*
    열리면 제목에 포커스를 준다. 첫 체크박스에 주지 않는다 — 스페이스를 잘못 누르면
    선택이 바뀐다.
  */
  useEffect(() => { titleRef.current?.focus(); }, []);

  /*
    body 스크롤 잠금. 복원을 cleanup에 두는 것이 핵심이다 — apply가 실패해 다이얼로그가
    열린 채로 남거나, 어떤 경로로 언마운트되더라도 스크롤이 잠긴 채 남지 않는다.
  */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  /** 다이얼로그이므로 Tab이 안에서 순환해야 한다. */
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      // 편집 중이면 그 편집에서 빠져나올 뿐, 다이얼로그는 유지한다. 제목을 고치다 Esc를
      // 눌렀는데 작업 전체가 닫히면 그때까지 고른 것이 통째로 날아간다.
      const el = e.target;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName)) {
        e.stopPropagation();
        el.blur();
        return;
      }
      e.stopPropagation();
      if (!busy) onClose?.();
      return;
    }

    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="-1"][data-focus-start]');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /** 쪼갠 묶음들 중 마지막인지. `되돌리기`를 그 묶음 아래 한 번만 띄우기 위한 판정이다. */
  const isLastOfSplit = (group) => {
    const family = actionable.filter((g) => g.splitFrom === group.splitFrom);
    return family[family.length - 1] === group;
  };

  /** 켜진 묶음 중 새로 만들 제목이 겹치는 것이 있는지. */
  const duplicateSelectedTitle = (() => {
    const keys = selectedGroups
        .filter((g) => g.action === ProposalAction.CREATE_AND_LINK
            && (destinations[g.groupId] ?? CREATE_NEW) === CREATE_NEW)
        .map((g) => titleKey(titles[g.groupId]))
        .filter((key) => key.length > 0);
    return new Set(keys).size !== keys.length;
  })();

  return (
    <div className="proposal-dialog-overlay" role="presentation">
      <div
        className="proposal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-dialog-title"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <div className="proposal-dialog-head">
          <h2 className="proposal-dialog-title" id="proposal-dialog-title"
              tabIndex={-1} data-focus-start ref={titleRef}>
            프로젝트 연결 제안 <span className="proposal-dialog-count">{totalCount}</span>
          </h2>
          <button type="button" className="icon-btn" aria-label="제안 닫기" disabled={busy} onClick={onClose}>
            <X size={14} />
          </button>
          <p className="proposal-dialog-sub">확인 후 필요한 항목만 연결할 수 있어요.</p>
        </div>

        <div className="proposal-dialog-body">
      {actionable.length === 0 && (
        <p className="view-dim proposal-dialog-empty">지금은 묶어서 제안할 만한 게 없어요.</p>
      )}

      {actionable.length > 0 && (
        <div className="proposal-select-all">
          <label className="proposal-select-all-label">
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={allSelected}
              disabled={busy}
              onChange={toggleAll}
            />
            전체 선택 <span className="proposal-select-all-count">({selectedCount}/{actionable.length})</span>
          </label>
          <button type="button" className="proposal-select-all-clear" disabled={busy || noneSelected}
                  onClick={() => setSelected({})}>
            선택 해제
          </button>
        </div>
      )}

      <ul className="proposal-group-list">
        {actionable.map((group) => {
          const destination = destinations[group.groupId] ?? CREATE_NEW;
          const isNew = group.action === ProposalAction.CREATE_AND_LINK && destination === CREATE_NEW;
          return (
            <li
              key={group.groupId}
              className={`proposal-group ${
                group.defaultSelected && (group.notices ?? []).length === 0 ? 'is-confirmed' : 'is-review'}`}
            >
              {/*
                한 줄 = 한 제안 그룹이다. 파일 하나가 아니다 — 두 파일이 한 프로젝트로
                묶이면 한 줄에 파일 두 개다. 파일 단위로 줄을 만들면 그 묶음을 표현할
                수 없고 `따로 나누기`가 붙을 자리도 없어진다.
              */}
              <div className="proposal-group-head">
                <input
                  type="checkbox"
                  checked={!!selected[group.groupId]}
                  disabled={busy}
                  aria-label={`${destinationTitle(group)} 선택`}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [group.groupId]: e.target.checked }))}
                />
                <span className="proposal-group-main">
                  {/* 접힌 줄의 제목은 텍스트다. 대부분 고치지 않으므로 입력 박스를 늘 열어두지 않는다. */}
                  <span className="proposal-group-title">{destinationTitle(group)}</span>
                  <span className="proposal-group-summary">{summaryLine(group)}</span>
                </span>
                <button type="button" className="proposal-group-edit" disabled={busy}
                        onClick={() => setExpanded((prev) => ({ ...prev, [group.groupId]: true }))}>
                  수정
                </button>
                <button
                  type="button"
                  className="proposal-group-toggle"
                  aria-expanded={!!expanded[group.groupId]}
                  aria-controls={`proposal-group-body-${group.groupId}`}
                  aria-label={`${destinationTitle(group)} 자세히`}
                  onClick={() => setExpanded((prev) => ({ ...prev, [group.groupId]: !prev[group.groupId] }))}
                >
                  <ChevronRight size={14}
                    className={expanded[group.groupId] ? 'proposal-caret is-open' : 'proposal-caret'} />
                </button>
              </div>

              {(group.notices ?? []).map((notice) => (
                <p key={notice} className="proposal-notice">
                  <AlertCircle size={13} /> {notice}
                </p>
              ))}

              {expanded[group.groupId] && (
              <div className="proposal-group-body" id={`proposal-group-body-${group.groupId}`}>

              {group.action === ProposalAction.CREATE_AND_LINK && isNew && (
                <label className="proposal-field">
                  <span className="proposal-field-label">프로젝트명</span>
                  <input
                    type="text"
                    className="learning-input proposal-title-input"
                    value={titles[group.groupId] ?? ''}
                    disabled={busy}
                    aria-label="새 프로젝트 이름"
                    onChange={(e) =>
                      setTitles((prev) => ({ ...prev, [group.groupId]: e.target.value }))}
                  />
                </label>
              )}

              {/*
                동명 경고가 붙은 묶음은 existingCourseId가 없다. 프론트가 제목으로 프로젝트를
                되찾아 id를 추론하지 않도록 서버가 matchingProjects에 후보를 실어 준다.
              */}
              {(group.matchingProjects ?? []).length > 0 && (
                <div className="proposal-destinations" role="radiogroup" aria-label="어디에 넣을지">
                  <label className="proposal-destination">
                    <input
                      type="radio"
                      name={`dest-${group.groupId}`}
                      checked={destination === CREATE_NEW}
                      disabled={busy}
                      onChange={() =>
                        setDestinations((prev) => ({ ...prev, [group.groupId]: CREATE_NEW }))}
                    />
                    새로 만들기
                  </label>
                  {group.matchingProjects.map((project) => (
                    <label key={project.courseId} className="proposal-destination">
                      <input
                        type="radio"
                        name={`dest-${group.groupId}`}
                        checked={destination === project.courseId}
                        disabled={busy}
                        onChange={() =>
                          setDestinations((prev) => ({ ...prev, [group.groupId]: project.courseId }))}
                      />
                      기존 &ldquo;{project.title}&rdquo;에 붙이기
                    </label>
                  ))}
                </div>
              )}

              <ul className="proposal-member-list">
                {group.members.map((member) => (
                  <li key={member.materialId} className="proposal-member">
                    <span className="proposal-member-name" title={member.originalFilename}>
                      <FileText size={13} /> {member.originalFilename}
                    </span>
                    <MaterialTypeSelect
                      value={types[group.groupId]?.[member.materialId] ?? MaterialType.OTHER}
                      disabled={busy}
                      label={`${member.originalFilename}의 자료 역할`}
                      onChange={(t) => setType(group.groupId, member.materialId, t)}
                    />
                  </li>
                ))}
              </ul>

              {/*
                reason과 evidence를 접기 안에 한 번씩만 둔다. 전에는 둘 다 밖에 나와서
                사실상 같은 말을 두 번 했다.
              */}
              <div className="proposal-why">
                <button
                  type="button"
                  className="proposal-why-toggle"
                  aria-expanded={!!reasonOpen[group.groupId]}
                  aria-controls={`proposal-why-${group.groupId}`}
                  onClick={() => setReasonOpen((prev) => ({ ...prev, [group.groupId]: !prev[group.groupId] }))}
                >
                  왜 이렇게 추천했나요?
                  <ChevronRight size={13}
                    className={reasonOpen[group.groupId] ? 'proposal-caret is-open' : 'proposal-caret'} />
                </button>
                {reasonOpen[group.groupId] && (
                  <div className="proposal-why-body" id={`proposal-why-${group.groupId}`}>
                    {group.reason && <p className="proposal-group-reason">{group.reason}</p>}
                    {/*
                      쪼갠 묶음의 제목은 파일명에서 나온 추정값이라 그렇다고 말해준다.
                      멤버의 evidenceSource는 건드리지 않았으므로 파일별 근거는 그대로다 —
                      여기서 바뀐 것은 제목이지 근거가 아니다.
                    */}
                    {group.splitFrom && (
                      <p className="proposal-group-reason">파일명에서 가져온 이름이에요</p>
                    )}
                    <ul className="proposal-why-list">
                      {group.members.map((member) => (
                        <li key={member.materialId} className="proposal-why-item">
                          <span className="proposal-why-file">{member.originalFilename}</span>
                          <span className="proposal-member-note">{memberNote(member)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/*
                잘못 묶였을 때 사용자가 그 자리에서 푸는 길. LINK_EXISTING에는 붙이지 않는다 —
                쪼개도 전부 같은 기존 프로젝트로 가므로 결과가 같다.
              */}
              {group.action === ProposalAction.CREATE_AND_LINK
                  && !group.splitFrom
                  && group.members.length > 1 && (
                <button type="button" className="btn-ghost btn-sm proposal-split-btn"
                        disabled={busy} onClick={() => splitGroup(group)}>
                  <Scissors size={13} /> 따로 나누기
                </button>
              )}

              {group.splitFrom && isLastOfSplit(group) && (
                <button type="button" className="btn-ghost btn-sm proposal-split-btn"
                        disabled={busy} onClick={() => undoSplit(group.splitFrom)}>
                  <Undo2 size={13} /> 되돌리기
                </button>
              )}
              </div>
              )}
            </li>
          );
        })}
      </ul>

      {leaveGroup && (
        <div className="proposal-leave">
          <button
            type="button"
            className="proposal-leave-toggle"
            aria-expanded={leaveOpen}
            onClick={() => setLeaveOpen((prev) => !prev)}
          >
            <ChevronRight size={13} className={leaveOpen ? 'proposal-leave-caret is-open' : 'proposal-leave-caret'} />
            지금은 그냥 둘 자료 {leaveGroup.members.length}개
          </button>
          {leaveOpen && (
            <ul className="proposal-member-list">
              {leaveGroup.members.map((member) => (
                <li key={member.materialId} className="proposal-member">
                  <span className="proposal-member-name" title={member.originalFilename}>
                    <FileText size={13} /> {member.originalFilename}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {actionable.length > 0 && <p className="proposal-dialog-hint">{MATERIAL_TYPE_HINT}</p>}
        </div>

      {/*
        서버의 동명 검사는 제안을 만든 시점에만 돈다. 쪼개기와 제목 편집으로 그 뒤에
        같은 이름이 생길 수 있어 여기서 한 번 더 본다. 막지는 않는다 — 사용자가 의도한
        것일 수 있다.
      */}
        {duplicateSelectedTitle && (
          <p className="proposal-notice proposal-dialog-warn">
            <AlertCircle size={13} /> 같은 이름의 프로젝트가 두 개 만들어져요.
          </p>
        )}

        {error && <p className="view-error proposal-dialog-warn">{error}</p>}

        <div className="proposal-dialog-foot">
          {remaining.length > 0 && (
            <button type="button" className="btn-ghost btn-sm" disabled={busy}
                    onClick={() => onShowRemaining?.(remaining)}>
              남은 {remaining.length}개 보기
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm proposal-dialog-later" disabled={busy} onClick={onClose}>
            나중에 하기
          </button>
          <button type="button" className="btn-primary" disabled={busy || selectedGroups.length === 0}
                  onClick={handleApply}>
            {applying
              ? <><Loader2 size={13} className="spin" /> 정리하는 중</>
              : <>선택 항목 연결하기 ({selectedGroups.length})</>}
          </button>
        </div>
      </div>
    </div>
  );
}
