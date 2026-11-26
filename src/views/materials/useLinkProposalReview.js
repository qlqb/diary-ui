/**
 * 연결 제안 창의 상태. 파일 하나 = 넣을 곳 하나다. AI 묶음은 "어떻게 추천됐는지"를 보여 주는 소제목일 뿐이다.
 *
 * - dest: 파일마다 넣을 곳 키(lib/linkProposal.js). 처음엔 AI 추천.
 * - included: 연결에 넣을지. 확신 있는 추천은 처음부터 켜져 있다.
 * - decided: AI가 자신 없는 파일 중 사용자가 한 번 고른 것. 고르기 전에는 연결에 넣지 않는다.
 * - titles: 이번에 새로 만들 프로젝트의 이름(newKey → 이름).
 */
import { useMemo, useState } from 'react';
import { materialStoreAPI } from '../../api/api.js';
import { MaterialType } from '../../types/learning.js';
import {
  LEAVE, buildApplyGroups, isExistingKey, isNewKey, newKey, recommendedKey, reviewReason, titleKey,
} from '../../lib/linkProposal.js';

export function useLinkProposalReview({ proposal, projects = [], onApplied }) {
  const groups = useMemo(() => proposal.groups ?? [], [proposal]);
  const files = useMemo(() => groups.flatMap((group) => group.members.map((member) => ({
    id: member.materialId, member, group, recommended: recommendedKey(group), review: reviewReason(group),
  }))), [groups]);

  const [dest, setDest] = useState(() => Object.fromEntries(files.map((f) => [f.id, f.recommended])));
  const [included, setIncluded] = useState(() => Object.fromEntries(files.map((f) => [f.id, f.recommended !== LEAVE && !f.review])));
  const [decided, setDecided] = useState({});
  const [roles, setRoles] = useState(() => Object.fromEntries(files.map((f) => [f.id, f.member.materialType ?? MaterialType.OTHER])));
  const [titles, setTitles] = useState(() => Object.fromEntries(groups
    .filter((g) => g.action === 'CREATE_AND_LINK').map((g) => [newKey(g.groupId), g.proposedTitle ?? ''])));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  const projectTitle = (courseId) => projects.find((p) => p.courseId === courseId)?.title
    ?? groups.flatMap((g) => g.matchingProjects ?? []).find((p) => p.courseId === courseId)?.title
    ?? groups.find((g) => g.existingCourseId === courseId)?.existingCourseTitle
    ?? '기존 프로젝트';

  /** 넣을 곳 키 → { label, kind: existing | new | leave } */
  const describe = (key) => {
    if (key === LEAVE) return { label: '그냥 두기', kind: 'leave' };
    if (isExistingKey(key)) return { label: projectTitle(Number(key.slice(2))), kind: 'existing' };
    return { label: titles[key]?.trim() || '새 프로젝트', kind: 'new' };
  };

  /** 메뉴의 "내 프로젝트". 내 목록에 서버가 짚어 준 곳(보관된 곳일 수 있다)을 더한다. */
  const projectOptions = (() => {
    const seen = new Map(projects.map((p) => [p.courseId, p.title]));
    groups.forEach((g) => {
      (g.matchingProjects ?? []).forEach((p) => { if (!seen.has(p.courseId)) seen.set(p.courseId, p.title); });
      if (g.existingCourseId != null && !seen.has(g.existingCourseId)) seen.set(g.existingCourseId, g.existingCourseTitle ?? '기존 프로젝트');
    });
    return [...seen].map(([courseId, title]) => ({ courseId, title }));
  })();

  /** 이번에 새로 만들 프로젝트들. 다른 파일도 같은 새 프로젝트로 보낼 수 있게 메뉴에 띄운다. */
  const newDestinations = [...new Set(Object.values(dest).filter(isNewKey))];

  const chooseMany = (list, key) => {
    setDest((prev) => ({ ...prev, ...Object.fromEntries(list.map((f) => [f.id, key])) }));
    setIncluded((prev) => ({ ...prev, ...Object.fromEntries(list.map((f) => [f.id, key !== LEAVE])) }));
    setDecided((prev) => ({ ...prev, ...Object.fromEntries(list.filter((f) => f.review).map((f) => [f.id, true])) }));
  };
  /** 새 프로젝트를 이 이름으로 만들고 고른 파일들을 넣는다. */
  const createProject = (list, title) => {
    const key = newKey(`made-${list.map((f) => f.id).join('-')}-${Object.keys(titles).length}`);
    setTitles((prev) => ({ ...prev, [key]: title.trim() }));
    chooseMany(list, key);
  };
  const accept = (file) => chooseMany([file], file.recommended);
  const reset = (file) => {
    setDest((prev) => ({ ...prev, [file.id]: file.recommended }));
    setIncluded((prev) => ({ ...prev, [file.id]: file.recommended !== LEAVE && (!file.review || !!decided[file.id]) }));
  };
  const setOn = (file, on) => {
    setIncluded((prev) => ({ ...prev, [file.id]: on && dest[file.id] !== LEAVE }));
  };
  /** 이번에 만들 새 프로젝트를 취소한다. 그 파일들은 AI 추천으로 돌아간다(추천이 바로 그 새 프로젝트였으면 그냥 두기). */
  const cancelProject = (key) => {
    const list = files.filter((f) => dest[f.id] === key);
    setDest((prev) => ({ ...prev, ...Object.fromEntries(list.map((f) => [f.id, f.recommended === key ? LEAVE : f.recommended])) }));
    setIncluded((prev) => ({ ...prev, ...Object.fromEntries(list.map((f) => [f.id, f.recommended !== key && f.recommended !== LEAVE])) }));
  };
  const renameProject = (key, title) => setTitles((prev) => ({ ...prev, [key]: title }));

  const waiting = (f) => !!f.review && !decided[f.id];
  const isActive = (f) => !!included[f.id] && dest[f.id] !== LEAVE && !waiting(f);
  const changed = (f) => dest[f.id] !== f.recommended;
  const active = files.filter(isActive);
  const pending = files.filter(waiting);
  const changedCount = files.filter(changed).length;
  const missingTitle = active.some((f) => isNewKey(dest[f.id]) && !(titles[dest[f.id]] ?? '').trim());

  /** 맨 위 요약: 어디로 몇 개. 연결에 들어가는 것만. */
  const summary = (() => {
    const counts = new Map();
    active.forEach((f) => counts.set(dest[f.id], (counts.get(dest[f.id]) ?? 0) + 1));
    return [...counts].map(([key, count]) => ({ key, count, ...describe(key) }));
  })();
  const leaveCount = files.filter((f) => !isActive(f) && !waiting(f)).length;

  /** 이름이 겹치는 새 프로젝트(기존 프로젝트 또는 다른 새 프로젝트와). 막지 않고 알린다. */
  const clash = summary.find((s) => {
    if (s.kind !== 'new') return false;
    const k = titleKey(titles[s.key]);
    return k && (projectOptions.some((p) => titleKey(p.title) === k)
      || summary.filter((o) => o.kind === 'new' && titleKey(titles[o.key]) === k).length > 1);
  });

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await materialStoreAPI.applyLinkProposal(buildApplyGroups(active, dest, roles, titles));
      await onApplied?.();
    } catch (err) {
      setError(err.message || '연결하지 못했어요. 잠시 뒤 다시 해 주세요.');
    } finally {
      setApplying(false);
    }
  };

  return {
    groups, files, dest, roles, setRoles, titles, applying, error, projectOptions, newDestinations,
    describe, chooseMany, createProject, accept, reset, setOn, cancelProject, renameProject,
    waiting, isActive, changed, active, pending, changedCount, missingTitle, summary, leaveCount, clash, apply,
  };
}
