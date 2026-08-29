/**
 * 자료 연결 제안 검토 카드.
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

import { useState } from 'react';
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

export default function ProposalCard({
  proposal,
  onApplied,
  onClose,
  onShowRemaining,
  onRetry,
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
    <div className="proposal-card">
      <div className="proposal-card-head">
        <h2 className="proposal-card-title">자료 {totalCount}개를 정리할까요?</h2>
        <button type="button" className="icon-btn" aria-label="제안 닫기" disabled={busy} onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {actionable.length === 0 && (
        <p className="view-dim proposal-card-empty">지금은 묶어서 제안할 만한 게 없어요.</p>
      )}

      <ul className="proposal-group-list">
        {actionable.map((group) => {
          const destination = destinations[group.groupId] ?? CREATE_NEW;
          const isNew = group.action === ProposalAction.CREATE_AND_LINK && destination === CREATE_NEW;
          return (
            <li key={group.groupId} className={`proposal-group${selected[group.groupId] ? ' is-selected' : ''}`}>
              <label className="proposal-group-head">
                <input
                  type="checkbox"
                  checked={!!selected[group.groupId]}
                  disabled={busy}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [group.groupId]: e.target.checked }))}
                />
                <span className="proposal-group-label">
                  {group.action === ProposalAction.LINK_EXISTING ? (
                    <>기존 <strong>{group.existingCourseTitle}</strong>에 연결</>
                  ) : isNew ? (
                    <>새 프로젝트를 만들고 연결</>
                  ) : (
                    <>기존 프로젝트에 연결</>
                  )}
                </span>
              </label>

              {group.action === ProposalAction.CREATE_AND_LINK && isNew && (
                <input
                  type="text"
                  className="learning-input proposal-title-input"
                  value={titles[group.groupId] ?? ''}
                  disabled={busy}
                  aria-label="새 프로젝트 이름"
                  onChange={(e) =>
                    setTitles((prev) => ({ ...prev, [group.groupId]: e.target.value }))}
                />
              )}

              {(group.notices ?? []).map((notice) => (
                <p key={notice} className="proposal-notice">
                  <AlertCircle size={13} /> {notice}
                </p>
              ))}

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
                    <span className="proposal-member-note">{memberNote(member)}</span>
                  </li>
                ))}
              </ul>

              {group.reason && <p className="proposal-group-reason">↳ {group.reason}</p>}

              {/*
                쪼갠 묶음의 제목은 파일명에서 나온 추정값이라 그렇다고 말해준다.
                멤버의 evidenceSource는 건드리지 않았으므로 근거 줄은 그대로 남는다 —
                여기서 바뀐 것은 제목이지 근거가 아니다.
              */}
              {group.splitFrom && (
                <p className="proposal-group-reason">↳ 파일명에서 가져온 이름이에요</p>
              )}

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

      {actionable.length > 0 && <p className="proposal-card-hint">{MATERIAL_TYPE_HINT}</p>}

      {/*
        서버의 동명 검사는 제안을 만든 시점에만 돈다. 쪼개기와 제목 편집으로 그 뒤에
        같은 이름이 생길 수 있어 여기서 한 번 더 본다. 막지는 않는다 — 사용자가 의도한
        것일 수 있다.
      */}
      {duplicateSelectedTitle && (
        <p className="proposal-notice">
          <AlertCircle size={13} /> 같은 이름의 프로젝트가 두 개 만들어져요.
        </p>
      )}

      {error && <p className="view-error">{error}</p>}

      <div className="proposal-card-foot">
        {remaining.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy}
                  onClick={() => onShowRemaining?.(remaining)}>
            남은 {remaining.length}개 보기
          </button>
        )}
        {onRetry && (
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onRetry}>
            다시 시도
          </button>
        )}
        <button type="button" className="btn-ghost btn-sm proposal-card-later" disabled={busy} onClick={onClose}>
          나중에
        </button>
        <button type="button" className="btn-primary" disabled={busy || selectedGroups.length === 0}
                onClick={handleApply}>
          {applying
            ? <><Loader2 size={13} className="spin" /> 정리하는 중</>
            : <>{selectedGroups.length}개 프로젝트 정리</>}
        </button>
      </div>
    </div>
  );
}
