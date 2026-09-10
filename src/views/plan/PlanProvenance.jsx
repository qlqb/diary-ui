/**
 * "무엇을 보고 이 계획을 만들었나" — 생성 회차에 AI에게 준 정보와, 항목 하나하나의 근거.
 *
 * ★ 셋을 섞지 않는다. 원본 정보(사용자가 등록한 일정·학습 항목), 서버 계산(남는 시간
 * 추정), AI 추정(예상 소요 시간)은 무게가 다르다. 한 목록에 뭉쳐 놓으면 추정이 등록된
 * 사실과 같은 것으로 읽힌다.
 *
 * ★ "확인됨", "제약 반영 완료", "배치 확정" 같은 말을 쓰지 않는다. 여기 있는 것은 "이
 * 정보를 줬다"는 사실이고, AI가 그것을 제대로 썼는지는 다른 질문이다. 인용 번호가
 * 맞다고 해서 내용이 맞다는 뜻이 되지 않는다.
 *
 * ★ 당시 값과 지금 원본을 나눠 보여준다. 원본이 바뀌어도 위쪽 값은 그때 그대로이고,
 * 아래 링크만 지금 것을 연다. 지워진 원본은 링크를 끄고 이유를 말한다.
 *
 * 항목 근거(ItemEvidence)는 <b>짧은 기본 화면</b>과 <b>상세</b>로 나뉜다. 기본 화면은 학습
 * 범위 · 참고 자료 · AI의 제안 세 묶음이고, 자료마다 열기 액션이 하나다. 개별 인용 줄과
 * 회차 전체 정보는 "생성 당시 정보 자세히 보기" 안에 그대로 남는다 — 줄이는 것은 반복이지
 * 근거가 아니다.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import {
  EVIDENCE_STATUS_LABEL, INPUT_LINEAGE_LABEL, PROVENANCE_REPRESENTATION_LABEL,
  PROVENANCE_SOURCE_LABEL, SERVER_CALCULATION_LABEL,
} from '../../lib/planLabels.js';
import {
  MATERIALS_SHOWN_BY_DEFAULT, buildEvidenceSummary, locatorHint, materialActionLabel, stripRef,
} from '../../lib/planEvidence.js';
import MaterialFileLink from '../../components/MaterialFileLink.jsx';

/** 이 화면에서 여는 원본. 서버가 내려준 target 중 화면이 실제로 아는 것만 연다. */
const LINK_TARGET_LABEL = {
  COURSE: '프로젝트 열기',
  // 학습 항목 단건으로 바로 가는 경로가 아직 없어서 그 항목이 있는 프로젝트를 연다.
  // 라벨이 여는 곳과 달라지면 사용자는 링크가 깨진 줄 안다.
  TOPIC: '프로젝트 열기',
  ROUTINE: '일정에서 보기',
  COMMITMENT: '일정에서 보기',
  EXECUTION_ITEM: '일정에서 보기',
};

/**
 * 생성 회차 전체: "생성 시 참고한 정보".
 *
 * 기본은 접힘이다. 이 패널은 계획을 읽는 데 필요한 것이 아니라 의심이 들 때 여는 것이라,
 * 펼쳐 두면 조각 목록보다 먼저 눈에 들어와 화면의 무게중심이 옮겨간다.
 */
export default function PlanProvenancePanel({ provenance, loading, error, onOpenSource, onRetry }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="plan-provenance">
      <button
        type="button"
        className="plan-strategy-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>생성 시 참고한 정보</span>
      </button>

      {open && (
        <div className="plan-provenance-body">
          {loading && <p className="muted">불러오는 중…</p>}
          {error && (
            <p className="error-text">
              {error}
              {onRetry && <> <button type="button" className="btn-ghost btn-sm" onClick={onRetry}>다시 시도</button></>}
            </p>
          )}
          {!loading && !error && provenance && !provenance.recorded && (
            <p className="muted">이 초안에는 생성 당시 출처 기록이 없어요.</p>
          )}
          {!loading && !error && provenance?.recorded && (
            <ProvenanceBody provenance={provenance} onOpenSource={onOpenSource} />
          )}
        </div>
      )}
    </section>
  );
}

function ProvenanceBody({ provenance, onOpenSource }) {
  const sources = provenance.providedSources ?? [];
  const calculations = provenance.serverCalculations ?? [];
  const groups = groupByType(sources);

  return (
    <>
      <p className="plan-provenance-note">
        아래는 계획을 만들 때 AI에게 준 정보예요. 준 정보가 모두 그대로 반영된다는 뜻은 아니에요.
      </p>
      <p className="hint">
        {formatMoment(provenance.capturedAt)} 기준 · {provenance.startDate} ~ {provenance.endDate}
        {provenance.timezone ? ` · ${provenance.timezone}` : ''}
        {' · 생성 당시 값이며, 필요한 항목만 골라서 줬어요'}
      </p>

      {sources.length === 0 && <p className="muted">이 회차에는 준 정보가 없어요.</p>}
      {groups.map(([type, items]) => (
        <div key={type} className="plan-provenance-group">
          <h4>{PROVENANCE_SOURCE_LABEL[type] ?? '그 밖의 정보'} {items.length}건</h4>
          <ul>
            {items.map((source) => (
              <SourceLine key={source.refId} source={source} onOpenSource={onOpenSource} />
            ))}
          </ul>
        </div>
      ))}

      {calculations.length > 0 && (
        <div className="plan-provenance-group">
          <h4>서버가 계산한 것</h4>
          <ul>
            {calculations.map((calculation) => (
              <li key={calculation.calculationId} className="plan-provenance-calc">
                <span className="plan-provenance-calc-name">
                  {SERVER_CALCULATION_LABEL[calculation.kind] ?? '계산'}
                </span>
                <span className="plan-provenance-calc-result">{formatResult(calculation.result)}</span>
                <span className="hint">
                  {INPUT_LINEAGE_LABEL[calculation.inputLineage] ?? ''}
                  {calculation.lineageNote ? ` · ${calculation.lineageNote}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * 원본 한 줄. 위는 그때 준 값, 아래는 지금 원본으로 가는 링크다.
 *
 * 링크가 없는 것도 이유를 말한다 — 버튼만 사라지면 사용자는 자기가 뭘 잘못 눌렀는지 본다.
 * 표현 방식("필요한 항목만 골라서")은 기본값과 다를 때만 붙인다 — 줄마다 같은 말을 반복하면
 * 정작 다른 줄이 묻힌다.
 */
export function SourceLine({ source, onOpenSource }) {
  const link = source.link ?? {};
  const canOpen = Boolean(link.available && LINK_TARGET_LABEL[link.target] && onOpenSource);
  const representation = source.representation && source.representation !== 'SELECTED_FIELDS'
    ? PROVENANCE_REPRESENTATION_LABEL[source.representation] : null;

  return (
    <li className="plan-provenance-source">
      <span className="plan-provenance-source-value">{stripRef(source.promptLine)}</span>
      {representation && <span className="hint">{representation}</span>}
      {source.material?.filename && (
        <span className="hint">
          {source.material.origin === 'CURRENT_LINK' ? '현재 연결된 자료 · ' : '원본 자료 · '}
          {source.material.filename}
        </span>
      )}
      {canOpen && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => onOpenSource(link.target, link.targetId, source.providedValue)}
        >
          <ExternalLink size={12} /> {LINK_TARGET_LABEL[link.target]}
        </button>
      )}
      {/*
        세 경우를 구분해 말한다. 열 수 있는 것, 원본은 남아 있지만 이 화면에서 갈 곳이
        없는 것, 그리고 지워진 것. 셋을 다 "열 수 없어요"로 뭉치면 사용자가 자기 데이터가
        사라졌다고 오해한다.
      */}
      {!canOpen && link.available && (
        <span className="hint plan-provenance-source-nolink">원본은 그대로 있어요</span>
      )}
      {!canOpen && !link.available && (
        <span className="hint plan-provenance-source-nolink">
          {link.unavailableReason ?? '지금은 원본을 열 수 없어요'}
        </span>
      )}
    </li>
  );
}

/**
 * 항목 하나의 근거. 접혀 있다가 펼치면 짧은 기본 화면이 나온다.
 *
 * 근거가 없으면 없다고 말한다. 있어 보이게 채우면 그 순간 이 화면 전체를 믿을 수 없게 된다.
 */
export function ItemEvidence({
  provenance, item, onOpenSource, label = '근거 보기', projectTitles = {}, onMaterialOpenError = null,
}) {
  const [open, setOpen] = useState(false);

  const statusLabel = EVIDENCE_STATUS_LABEL[item?.evidenceStatus] ?? null;
  const changedAfterApply = (item?.afterApplyChanges ?? []).length > 0;

  return (
    <div className="plan-evidence">
      <button
        type="button"
        className="btn-ghost btn-sm plan-evidence-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
        {statusLabel && <span className="plan-evidence-flag">{statusLabel}</span>}
        {changedAfterApply && <span className="plan-evidence-flag">적용 후 바뀜</span>}
      </button>

      {open && (
        <EvidenceBody
          provenance={provenance}
          item={item}
          onOpenSource={onOpenSource}
          projectTitles={projectTitles}
          onMaterialOpenError={onMaterialOpenError}
        />
      )}
    </div>
  );
}

/**
 * 근거 본문(기본 화면 + 상세). 토글 없이 내용만 그린다 — 적용된 항목 화면은 자기 토글을
 * 이미 갖고 있어서, 여기에도 토글이 있으면 두 번 펼쳐야 한다.
 *
 * 기본 화면은 내부 스크롤이 없다. 일반 사례(과목 하나·자료 하나·학습 항목 3~5개)에서 범위,
 * 파일명, 열기 버튼, AI 예상 시간이 한눈에 들어와야 한다. 긴 목록은 상세 안에만 있다.
 */
export function EvidenceBody({
  provenance, item, onOpenSource, projectTitles = {}, onMaterialOpenError = null, children = null,
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [allMaterials, setAllMaterials] = useState(false);
  const summary = buildEvidenceSummary(provenance, item, projectTitles);

  if (!item?.recorded) {
    return (
      <div className="plan-evidence-body">
        <p className="muted">이 항목에는 생성 당시 근거 기록이 없어요.</p>
      </div>
    );
  }

  const { scope, materials, ai, flags } = summary;
  const shownMaterials = allMaterials ? materials : materials.slice(0, MATERIALS_SHOWN_BY_DEFAULT);
  const hiddenMaterialCount = materials.length - shownMaterials.length;
  const projectFallback = firstProjectLink(summary, provenance, item);

  return (
    <div className="plan-evidence-body">
      {/* 해석을 바꾸는 상태는 맨 위에, 글로 말한다. 상세 안에 숨기지 않는다. */}
      {flags.staleReasons.map((reason) => (
        <p key={reason} className="plan-evidence-stale">{reason}</p>
      ))}
      {flags.afterApplyChanges.map((change) => (
        <p key={change} className="plan-evidence-stale">{change}</p>
      ))}

      {scope.kind === 'STUDY' && (
        <section className="plan-evidence-section">
          <h5>학습 범위</h5>
          {(scope.courseTitle || scope.weekLabel) && (
            <p className="plan-evidence-line">
              {[scope.courseTitle, scope.weekLabel].filter(Boolean).join(' · ')}
            </p>
          )}
          <ul className="plan-evidence-scope">
            {scope.groups.map((group) => (
              <li key={group.refId}>
                <span>{group.title}</span>
                {group.locator && <span className="hint"> · {group.locator}</span>}
                {group.children.length > 0 && (
                  <span className="plan-evidence-children">
                    {' — '}
                    {group.children.map((child) => child.title + (child.locator ? ` (${child.locator})` : '')).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {scope.kind === 'CONDITIONS' && (
        <section className="plan-evidence-section">
          <h5>참고한 일정·조건</h5>
          <ul className="plan-evidence-scope">
            {scope.conditions.map((condition) => (
              <li key={condition.refId}>
                <span className="hint">{PROVENANCE_SOURCE_LABEL[condition.sourceType] ?? '정보'} · </span>
                {condition.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {scope.kind === 'STUDY' && scope.conditions.length > 0 && (
        <section className="plan-evidence-section">
          <h5>함께 참고한 일정·조건</h5>
          <ul className="plan-evidence-scope">
            {scope.conditions.map((condition) => (
              <li key={condition.refId}>{condition.text}</li>
            ))}
          </ul>
        </section>
      )}

      {scope.kind === 'NONE' && (
        <p className="muted">이 항목에 연결된 원본 정보는 없어요.</p>
      )}

      {/*
        참고 자료. 자료 묶음마다 열기 액션 하나. 학습 항목마다 같은 버튼을 반복하지 않는다.
        직접 열 수 있으면 프로젝트로 가는 버튼은 여기 두지 않는다 — 그건 원문이 없을 때의
        보조 경로다.
      */}
      {scope.kind !== 'NONE' && (
        <section className="plan-evidence-section">
          <h5>참고 자료</h5>
          {materials.length === 0 && (
            <p className="plan-evidence-line">
              <span className="muted">연결된 원본 자료가 없어요</span>
              {projectFallback && onOpenSource && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => onOpenSource(projectFallback.target, projectFallback.targetId, projectFallback.providedValue)}
                >
                  <ExternalLink size={12} /> {LINK_TARGET_LABEL[projectFallback.target]}
                </button>
              )}
            </p>
          )}
          {materials.length > 0 && (
            <ul className="plan-evidence-materials">
              {shownMaterials.map((material) => (
                <MaterialLine
                  key={material.key}
                  material={material}
                  onOpenError={onMaterialOpenError}
                  fallback={material.openMode === 'NONE' || material.materialId == null ? projectFallback : null}
                  onOpenSource={onOpenSource}
                />
              ))}
            </ul>
          )}
          {hiddenMaterialCount > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAllMaterials(true)}>
              자료 {hiddenMaterialCount}개 더 보기
            </button>
          )}
          {allMaterials && materials.length > MATERIALS_SHOWN_BY_DEFAULT && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAllMaterials(false)}>
              자료 접기
            </button>
          )}
        </section>
      )}

      <section className="plan-evidence-section">
        <h5>AI의 제안</h5>
        {ai.reason && <p className="plan-evidence-reason">{ai.reason}</p>}
        {ai.estimates.length > 0 && (
          <p className="plan-evidence-line">{ai.estimates.join(' · ')}</p>
        )}
        {!ai.reason && ai.estimates.length === 0 && (
          <p className="muted">따로 적은 판단이 없어요.</p>
        )}
        {summary.calculations.length > 0 && (
          <p className="hint">
            서버가 계산한 것 · {summary.calculations.map((c) => `${SERVER_CALCULATION_LABEL[c.kind] ?? '계산'} ${formatResult(c.result)}`).join(' · ')}
          </p>
        )}
        <p className="hint">자료의 사실이 아니라 AI가 그렇게 봤다는 뜻이에요.</p>
      </section>

      {flags.unknownRefCount > 0 && (
        <p className="plan-evidence-dropped">
          AI가 이번 생성에 없던 출처 {flags.unknownRefCount}건을 함께 적어서 그건 뺐어요.
        </p>
      )}

      {/*
        상세: 개별 인용 줄과 회차 전체 정보. 여기만 스크롤 영역이다. 닫으면 위의 기본 화면이
        그 자리에 그대로 있다 — 항목 검토 위치를 잃지 않는다.
      */}
      <button
        type="button"
        className="btn-ghost btn-sm plan-evidence-detail-toggle"
        onClick={() => setDetailOpen((v) => !v)}
        aria-expanded={detailOpen}
      >
        {detailOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {detailOpen ? '생성 당시 정보 접기' : '생성 당시 정보 자세히 보기'}
      </button>
      {detailOpen && (
        <div className="plan-evidence-detail">
          <EvidenceDetail provenance={provenance} item={item} onOpenSource={onOpenSource} />
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * 자료 한 묶음. 파일명 · 확인할 위치 · 상태 한 줄 · 열기 액션 하나.
 *
 * 파일명은 자르지 않고 줄바꿈한다 — 자르면 키보드·터치에서 전체 이름을 볼 길이 따로 필요하다.
 * 상태(변경·삭제·다른 자료 연결)는 색이 아니라 글로 말한다.
 */
function MaterialLine({ material, onOpenError, fallback, onOpenSource }) {
  const action = materialActionLabel(material);
  const hint = locatorHint(material.locators);
  const currentDiffers = material.currentFilename && material.currentFilename !== material.filename;

  return (
    <li className="plan-evidence-material">
      <span className="plan-evidence-material-name">
        {material.origin === 'CURRENT_LINK' && <span className="hint">현재 연결된 자료 · </span>}
        {material.filename ?? '이름을 알 수 없는 자료'}
        {hint && <span className="hint"> · {hint}</span>}
      </span>
      {material.note && (
        <span className="plan-evidence-material-note">
          {material.note}
          {currentDiffers && material.state !== 'DELETED' ? ` (지금 파일: ${material.currentFilename})` : ''}
        </span>
      )}
      {action && (
        <MaterialFileLink
          materialId={material.materialId}
          filename={material.currentFilename ?? material.filename}
          contentType={material.contentType}
          label={action}
          onError={onOpenError}
        />
      )}
      {!action && fallback && onOpenSource && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => onOpenSource(fallback.target, fallback.targetId, fallback.providedValue)}
        >
          <ExternalLink size={12} /> {LINK_TARGET_LABEL[fallback.target]}
        </button>
      )}
    </li>
  );
}

/** 원문을 열 수 없을 때의 보조 경로: 이 항목이 인용한 학습 항목·프로젝트 중 열 수 있는 첫 것. */
function firstProjectLink(summary, provenance, item) {
  const byRef = new Map((provenance?.providedSources ?? []).map((s) => [s.refId, s]));
  for (const refId of item?.refIds ?? []) {
    const source = byRef.get(refId);
    const link = source?.link;
    if (link?.available && (link.target === 'COURSE' || link.target === 'TOPIC')) {
      return { target: link.target, targetId: link.targetId, providedValue: source.providedValue };
    }
  }
  return null;
}

/**
 * 상세: 이 항목이 인용한 줄 하나하나와 서버 계산. 묶음에서 개별 참조까지 추적하는 자리다.
 */
export function EvidenceDetail({ provenance, item, onOpenSource }) {
  const byRef = new Map((provenance?.providedSources ?? []).map((s) => [s.refId, s]));
  const linked = (item?.refIds ?? []).map((refId) => byRef.get(refId)).filter(Boolean);
  const calculations = (provenance?.serverCalculations ?? [])
    .filter((c) => (item?.serverCalculationIds ?? []).includes(c.calculationId));

  return (
    <div className="plan-evidence-detail-body">
      <p className="hint">
        {provenance?.capturedAt ? `${formatMoment(provenance.capturedAt)} 생성 · ` : ''}
        생성 당시 값이에요. 원본이 그 뒤에 바뀌었어도 여기 값은 그때 그대로예요.
      </p>
      <section>
        <h5>근거로 연결한 정보</h5>
        {linked.length === 0 ? (
          <p className="muted">이 항목에 연결된 원본 정보는 없어요.</p>
        ) : (
          <ul>
            {linked.map((source) => (
              <SourceLine key={source.refId} source={source} onOpenSource={onOpenSource} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h5>서버가 계산한 것</h5>
        {calculations.length === 0 ? (
          <p className="muted">
            이 항목만을 위한 서버 계산은 없어요. 기간 전체의 남는 시간 추정은
            「생성 시 참고한 정보」에서 볼 수 있어요.
          </p>
        ) : (
          <ul>
            {calculations.map((calculation) => (
              <li key={calculation.calculationId}>
                {SERVER_CALCULATION_LABEL[calculation.kind] ?? '계산'} · {formatResult(calculation.result)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 종류별로 묶되 서버가 준 순서를 지킨다 — 순서가 곧 프롬프트에 실린 순서다. */
function groupByType(sources) {
  const groups = new Map();
  sources.forEach((source) => {
    if (!groups.has(source.sourceType)) groups.set(source.sourceType, []);
    groups.get(source.sourceType).push(source);
  });
  return [...groups.entries()];
}

function formatMoment(iso) {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `${at.getFullYear()}. ${at.getMonth() + 1}. ${at.getDate()}. ${hh}:${mm}`;
}

/**
 * 계산 결과 한 줄. 서버가 낸 의미를 그대로 옮긴다 — 새 척도로 바꾸지 않는다.
 */
function formatResult(result) {
  if (!result) return '';
  const parts = [];
  if (result.availableMinutes != null) parts.push(`남는 시간 약 ${result.availableMinutes}분`);
  if (result.confidenceSummary) parts.push(result.confidenceSummary);
  if (result.targetMinutes != null) parts.push(`학습 예산 ${result.targetMinutes}분`);
  if (result.fillPercent != null) parts.push(`남는 시간의 ${result.fillPercent}%`);
  return parts.join(' · ');
}
