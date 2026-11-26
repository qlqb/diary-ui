/**
 * 상담 답변 아래의 "확인한 자료". 서버가 이 답을 위해 실제로 모델에 실은 근거와, 확인하지 못한 범위를 보여 준다.
 *
 * ★ 접힌 채로 시작한다 — 한 줄 요약만 보이고 입력창·주요 버튼을 밀어내지 않는다(1536×760 기준).
 * ★ 보여 준 것만 말한다. 원문(파일에서 읽은 글)·분석 목록(원문 아님)·앱에 저장된 사실을 구분하고, "일부만 읽음"·"발췌만"을
 *   그대로 적는다. 답변에 쓴 것은 앞에, 확인만 한 것은 뒤에 둔다.
 * ★ 쪽으로 열 수 있는 것은 PDF뿐이다. 한글 문서의 "구간 N"이나 슬라이드는 위치를 글로만 보여 주고, 파일은 그냥 연다 —
 *   지원하지 않는 쪽 이동을 되는 것처럼 보이지 않는다.
 */

import { BookOpen } from 'lucide-react';
import MaterialFileLink from '../components/MaterialFileLink.jsx';

const KIND_LABEL = {
  MATERIAL_TEXT: '원문',
  MATERIAL_SECTION: '분석 목록(원문 아님)',
  APP_FACT: '앱에 저장됨',
};

const READ_LABEL = {
  FULL: '그 부분 전체',
  PARTIAL: '일부만 읽음',
  EXCERPT_ONLY: '분석 때 저장한 발췌만',
};

const GAP_LABEL = {
  NOT_FOUND: '검색 범위에서 찾지 못함(없다는 뜻은 아니에요)',
  NO_TEXT: '글자를 읽을 수 없음(스캔본)',
  EXTRACTION_FAILED: '원문 추출 실패',
  EXTRACTING: '원문 추출 대기 중',
  NOT_READ_LIMIT: '한도 때문에 읽지 못함',
  CHANGED: '읽는 사이 바뀌거나 지워짐',
  NO_MATERIAL: '올린 자료 없음',
  UNKNOWN_REF: '확인할 수 없는 요청',
  LOOKUP_FAILED: '서버 오류로 확인하지 못함',
};

function SourceRow({ source }) {
  const kind = KIND_LABEL[source.kind] ?? '근거';
  const read = READ_LABEL[source.readState];
  return (
    <li className={`consult-evidence-source${source.used ? ' is-used' : ''}`}>
      <span className="consult-evidence-kind">{source.used ? '답변에 사용 · ' : ''}{kind}</span>
      <span className="consult-evidence-title">
        {source.title}
        {source.locator ? ` · ${source.locator}` : ''}
        {source.courseTitle ? ` · ${source.courseTitle}` : ''}
      </span>
      {(read || source.origin) && (
        <span className="consult-evidence-meta">{[source.origin, read].filter(Boolean).join(' · ')}</span>
      )}
      {source.materialId != null && source.kind !== 'APP_FACT' && (
        <MaterialFileLink
          materialId={source.materialId}
          filename={source.title}
          page={source.page ?? null}
          label={Number.isInteger(source.page) ? `p.${source.page} 열기` : null}
        />
      )}
    </li>
  );
}

export default function ConsultEvidence({ evidence }) {
  if (!evidence || (evidence.sources.length === 0 && evidence.gaps.length === 0)) return null;
  const used = evidence.sources.filter((s) => s.used);
  const rest = evidence.sources.filter((s) => !s.used);
  return (
    <details className="consult-evidence">
      <summary>
        <BookOpen size={13} aria-hidden="true" /> 확인한 자료
        {evidence.summary ? <span className="consult-evidence-summary"> · {evidence.summary}</span> : null}
      </summary>
      {used.length > 0 && (
        <ul className="consult-evidence-list" aria-label="답변에 사용한 근거">
          {used.map((s) => <SourceRow key={s.ref} source={s} />)}
        </ul>
      )}
      {rest.length > 0 && (
        <>
          <p className="consult-evidence-heading">확인했지만 답변에 쓰지 않음</p>
          <ul className="consult-evidence-list" aria-label="확인만 한 근거">
            {rest.map((s) => <SourceRow key={s.ref} source={s} />)}
          </ul>
        </>
      )}
      {evidence.gaps.length > 0 && (
        <>
          <p className="consult-evidence-heading">확인하지 못한 범위</p>
          <ul className="consult-evidence-list consult-evidence-gaps">
            {evidence.gaps.map((g, i) => (
              <li key={`${g.label}-${i}`}>
                <span className="consult-evidence-title">{g.label}</span>
                <span className="consult-evidence-meta">{GAP_LABEL[g.reason] ?? g.detail ?? g.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
