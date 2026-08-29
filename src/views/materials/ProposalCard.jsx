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
import { FileText, Loader2, X, ChevronRight, AlertCircle } from 'lucide-react';
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
  const groups = proposal.groups ?? [];
  const actionable = groups.filter((g) => g.action !== ProposalAction.LEAVE);
  const leaveGroup = groups.find((g) => g.action === ProposalAction.LEAVE);
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
