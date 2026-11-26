/**
 * 프로젝트 연결 제안 창의 규칙. 화면 없이 테스트할 수 있는 것만 여기 둔다.
 *
 * 넣을 곳(destination)은 문자열 키 하나로 다룬다.
 *   'c:<courseId>' 기존 프로젝트 · 'new:<id>' 이번에 새로 만들 프로젝트 · 'leave' 지금은 그냥 두기
 * 서버 요청을 만들 때만 LINK_EXISTING / CREATE_AND_LINK로 바꾼다 — 화면 안에서는 파일마다 넣을 곳 하나만 기억하면 된다.
 */

export const LEAVE = 'leave';
export const existingKey = (courseId) => `c:${courseId}`;
export const newKey = (id) => `new:${id}`;
export const isExistingKey = (key) => key.startsWith('c:');
export const isNewKey = (key) => key.startsWith('new:');
export const courseIdOf = (key) => Number(key.slice(2));

/** 이름 비교 기준. 서버의 동명 검사와 같다 — 공백 제거, 대소문자 무시. */
export function titleKey(title) {
  return (title ?? '').replace(/\s+/g, '').toLowerCase();
}

/**
 * AI가 자신 없는 묶음이면 그 이유 한 줄, 아니면 null. 이 묶음의 파일은 사용자가 한 번 고르기 전까지 연결에 넣지 않는다.
 * 실패·부족 계열 표현을 쓰지 않는다 — 결함이 아니라 제안의 확신도다.
 */
export function reviewReason(group) {
  if (group.action === 'LEAVE') return null;
  if ((group.notices ?? []).length > 0) return '같은 이름의 기존 프로젝트가 있어 그쪽으로 골랐어요';
  if (group.members.some((m) => m.evidenceSource === 'FILENAME_ONLY')) return '파일명만 보고 고른 곳이에요';
  if (!group.defaultSelected) return '근거를 확인하지 못한 추천이에요';
  return null;
}

/**
 * 묶음의 추천 자리. 새로 만들자고 했어도 같은 이름의 기존 프로젝트가 있으면 그쪽을 추천으로 둔다 —
 * 새 프로젝트를 늘리기보다 기존 프로젝트에 붙이는 쪽이 기본이다.
 */
export function recommendedKey(group) {
  if (group.action === 'LEAVE') return LEAVE;
  if (group.action === 'LINK_EXISTING' && group.existingCourseId != null) return existingKey(group.existingCourseId);
  if (group.matchingProjects?.[0]) return existingKey(group.matchingProjects[0].courseId);
  return newKey(group.groupId);
}

/** 근거 한 줄. 본문에서 본 것과 파일명만 본 것을 구분한다. */
export function evidenceText(member) {
  if (member.evidenceSource === 'CONTENT' && member.evidenceVerified) return `본문에서 본 것: “${member.evidence}”`;
  if (member.evidenceSource === 'FILENAME_ONLY') return `파일명에서 본 것: “${member.evidence}”`;
  return '근거를 찾지 못했어요';
}

/**
 * 파일명에서 사람이 부를 이름을 뽑는다: 확장자·앞 번호·(1)·주차·버전 표기를 떼고 _를 띄어쓰기로.
 * "3주_1.pdf"처럼 떼고 나면 쓸 말이 없으면 ''을 돌려준다 — 억지로 채우지 않고 사용자가 적게 한다.
 */
export function cleanName(filename) {
  const name = (filename ?? '').replace(/\.[^.]+$/, '')
    .replace(/\(\d+\)/g, ' ')
    .replace(/^\s*\d+\s*[._\-)]\s*/, '')
    .replace(/\d+\s*주(차)?(_\d+)?/g, ' ')
    .replace(/[_\s-]v\d+\b/gi, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[가-힣a-zA-Z]{2,}/.test(name) ? name : '';
}

/**
 * 새 프로젝트 이름의 기본값. 모두 같은 AI 새 프로젝트 제안에서 왔으면 그 이름, 파일 하나면 정리한 파일명,
 * 여럿이면 정리한 이름들의 공통 앞부분(단어 단위). 아무것도 없으면 ''.
 */
export function suggestProjectName(files) {
  const proposed = [...new Set(files.map((f) => (f.group.action === 'CREATE_AND_LINK' ? f.group.proposedTitle : null)))];
  if (proposed.length === 1 && proposed[0]) return proposed[0];
  const names = files.map((f) => cleanName(f.member.originalFilename));
  if (names.some((n) => !n)) return '';
  if (names.length === 1) return names[0];
  const words = names.map((n) => n.split(' '));
  const common = [];
  for (let i = 0; i < words[0].length; i += 1) {
    if (words.every((w) => w[i] === words[0][i])) common.push(words[0][i]);
    else break;
  }
  return common.join(' ');
}

/**
 * 서버에 보낼 묶음 목록. 연결에 넣는 파일만, 넣을 곳별로 묶는다.
 * @param files [{ id }] · dest {id: key} · roles {id: materialType} · titles {newKey: 이름}
 */
export function buildApplyGroups(files, dest, roles, titles) {
  const byDest = new Map();
  files.forEach((f) => {
    const key = dest[f.id];
    if (!byDest.has(key)) byDest.set(key, []);
    byDest.get(key).push({ materialId: f.id, materialType: roles[f.id] });
  });
  return [...byDest].map(([key, members]) => (isExistingKey(key)
    ? { action: 'LINK_EXISTING', existingCourseId: courseIdOf(key), members }
    : { action: 'CREATE_AND_LINK', title: (titles[key] ?? '').trim(), members }));
}
