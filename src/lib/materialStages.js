/**
 * 자료 하나가 지나가는 네 단계와, 끝나지 않은 작업이 왜 기다리는지의 문구.
 *
 *   등록 → 텍스트 추출 → 내용 분석 → 구조 제안(연결)
 *
 * 단계를 나눠 보여 주는 이유: "올렸는데 왜 아직이지"의 답이 단계마다 다르다. 등록은 끝났는데 본문을 못
 * 읽은 것과, 본문은 읽었는데 분석 차례를 기다리는 것과, 분석은 끝났는데 구조 제안이 승인을 기다리는 것은
 * 사용자가 할 일이 전부 다르다.
 *
 * ★ 기다림은 실패가 아니다. 한도·차례·일시중지·서비스 연결은 각자 다른 말을 하고, 어느 것도 "실패"나
 *   "중단"이라는 단어를 쓰지 않는다 — 대기 목록은 그대로 있고 이어서 처리된다.
 */

/** 단계 상태 → 글자. 색과 무관하게 이 글자만으로 상태를 알 수 있어야 한다. */
export const STAGE_STATE_LABEL = Object.freeze({
  done: '완료',
  partial: '일부 완료',
  running: '진행 중',
  waiting: '대기',
  paused: '멈춤',
  problem: '안 됨',
  skipped: '해당 없음',
  unknown: '확인 중',
});

export const STAGE_TITLES = Object.freeze(['등록', '텍스트 추출', '내용 분석', '구조 제안(연결)']);

const pad = (n) => String(n).padStart(2, '0');

/** "오늘 09:00" / "내일 09:00" / "9월 21일 09:00". 시각을 못 읽으면 null. */
export function formatResumeTime(iso, now = new Date()) {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(at) - dayStart(now)) / 86400000);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (diffDays === 0) return `오늘 ${time}`;
  if (diffDays === 1) return `내일 ${time}`;
  return `${at.getMonth() + 1}월 ${at.getDate()}일 ${time}`;
}

/** 오늘 한도 대기 문구. resumesAt이 없으면 시각을 지어내지 않는다. */
export function dailyLimitCopy(resumesAt, now = new Date()) {
  const when = formatResumeTime(resumesAt, now);
  return when
    ? `오늘 분석 한도에 닿아 대기 중이에요 · ${when}부터 이어서 처리해요`
    : '오늘 분석 한도에 닿아 대기 중이에요 · 한도가 풀리면 이어서 처리해요';
}

/** 기다리는 이유 → { short(칩), detail(한 줄) }. 모르는 값·null이면 null. */
export function waitingCopy(waitingReason, limit = null, now = new Date()) {
  switch (waitingReason) {
    case 'DAILY_LIMIT':
      return { short: '한도 대기', detail: dailyLimitCopy(limit?.resumesAt ?? null, now) };
    case 'QUEUED':
      return { short: '차례 대기', detail: '차례를 기다리는 중이에요 · 앞선 자료가 끝나면 바로 시작해요' };
    case 'PAUSED':
      return { short: '일시중지', detail: '자동 분석을 멈춰 둔 상태예요 · 재개하면 이어서 처리해요' };
    case 'SERVICE_UNAVAILABLE':
      return {
        short: '연결 대기',
        detail: '지금은 분석 서비스에 연결할 수 없어요 · 대기 목록은 그대로 있고, 연결되면 이어서 처리해요',
      };
    default:
      return null;
  }
}

function stageOfAnalysisState(state) {
  switch (state) {
    case 'DONE': return 'done';
    case 'PARTIAL': return 'partial';
    case 'RUNNING': return 'running';
    case 'QUEUED':
    case 'NONE': return 'waiting';
    case 'PAUSED': return 'paused';
    case 'FAILED':
    case 'UNAVAILABLE':
    case 'CANCELLED': return 'problem';
    case 'NO_TEXT': return 'skipped';
    default: return 'unknown';
  }
}

/**
 * 네 단계의 상태.
 *   material: { extractionStatus }  ('SUCCESS'가 아니면 본문을 못 읽은 것)
 *   status:   MaterialAnalysisStatusResponse | null  (없으면 아직 못 읽은 것 — "확인 중")
 */
export function materialStages(material, status) {
  const extracted = material?.extractionStatus === 'SUCCESS';
  const stages = [
    { title: STAGE_TITLES[0], state: 'done', note: null },
    {
      title: STAGE_TITLES[1],
      state: extracted ? 'done' : 'problem',
      note: extracted ? null : '본문을 읽지 못했어요',
    },
  ];
  if (!extracted) {
    stages.push({ title: STAGE_TITLES[2], state: 'skipped', note: '본문을 읽은 뒤에 할 수 있어요' });
    stages.push({ title: STAGE_TITLES[3], state: 'skipped', note: null });
    return stages;
  }
  const content = status ? stageOfAnalysisState(status.state) : 'unknown';
  const progress = status?.state === 'RUNNING' && status.totalChunks
    ? `${status.completedChunks ?? 0}/${status.totalChunks}` : null;
  stages.push({ title: STAGE_TITLES[2], state: content, note: progress });

  let link;
  if (!status) link = { state: 'unknown', note: null };
  else if (status.linkState == null) {
    link = content === 'done' || content === 'partial'
      ? { state: 'skipped', note: '프로젝트에 연결하면 시작해요' }
      : { state: 'waiting', note: '내용 분석 뒤에 시작해요' };
  } else {
    link = { state: stageOfAnalysisState(status.linkState), note: null };
  }
  stages.push({ title: STAGE_TITLES[3], ...link });
  return stages;
}

/** 이 파일 내용이 쓰이지 않는다는 말. 실패·미지원 파일마다 붙는다. */
export const NOT_USED_IMPACT = '이 파일 내용은 상담·계획에 쓰이지 않아요';

/** 구조 제안을 승인하지 않아도 된다는 말. 분석 상태가 보이는 곳마다 같은 문장을 쓴다. */
export const CONSULT_BEFORE_APPROVAL = '구조 제안을 승인하기 전에도 상담과 계획은 할 수 있어요';

/**
 * 자료·구간이 "앱에 없는 첨부"를 언급한다는 표시를 읽는다. 서버가 실어 줄 때만 값이 있다.
 * 이름 목록(빈 배열일 수 있음)을 돌려주고, 표시가 없으면 null.
 */
export function unheldAttachmentsOf(source) {
  if (!source) return null;
  const names = source.unheldAttachments ?? source.missingAttachments ?? null;
  if (Array.isArray(names) && names.length > 0) return names.map(String);
  if (source.mentionsUnheldAttachment === true) return [];
  return null;
}

/** 사용자가 그 파일을 갖고 있는지는 앱이 모른다. 아는 것은 "앱에 올라오지 않았다"뿐이다. */
export const UNHELD_ATTACHMENT_NOTE = '앱에 올라오지 않은 첨부 파일을 언급해요';
