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
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import {
  EVIDENCE_STATUS_LABEL, INPUT_LINEAGE_LABEL, PROVENANCE_REPRESENTATION_LABEL,
  PROVENANCE_SOURCE_LABEL, SERVER_CALCULATION_LABEL,
} from '../../lib/planLabels.js';

/** 이 화면에서 여는 원본. 서버가 내려준 target 중 화면이 실제로 아는 것만 연다. */
const LINK_TARGET_LABEL = {
  COURSE: '프로젝트 열기',
  // 학습 항목 단건으로 바로 가는 경로가 아직 없어서 그 항목이 있는 프로젝트를 연다.
  // 라벨이 여는 곳과 달라지면 사용자는 링크가 깨진 줄 안다.
  TOPIC: '프로젝트에서 보기',
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
export default function PlanProvenancePanel({ provenance, loading, error, onOpenSource }) {
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
          {error && <p className="error-text">{error}</p>}
          {!loading && !error && !provenance?.recorded && (
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
 */
export function SourceLine({ source, onOpenSource }) {
  const link = source.link ?? {};
  const canOpen = Boolean(link.available && LINK_TARGET_LABEL[link.target] && onOpenSource);

  return (
    <li className="plan-provenance-source">
      <span className="plan-provenance-source-value">{stripRef(source.promptLine)}</span>
      <span className="hint">
        생성 당시 값 · {PROVENANCE_REPRESENTATION_LABEL[source.representation] ?? '골라서'}
      </span>
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
 * 항목 하나의 근거. 원본 정보 · 서버 계산 · AI 추정을 나눠서 보여준다.
 *
 * 근거가 없으면 없다고 말한다. 있어 보이게 채우면 그 순간 이 화면 전체를 믿을 수 없게 된다.
 */
export function ItemEvidence({ provenance, item, onOpenSource, label = '근거 보기' }) {
  const [open, setOpen] = useState(false);

  const statusLabel = EVIDENCE_STATUS_LABEL[item?.evidenceStatus] ?? null;

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
      </button>

      {open && <EvidenceBody provenance={provenance} item={item} onOpenSource={onOpenSource} />}
    </div>
  );
}

/**
 * 근거 본문. 토글 없이 내용만 그린다 — 적용된 항목 화면은 자기 토글을 이미 갖고 있어서,
 * 여기에도 토글이 있으면 두 번 펼쳐야 한다.
 */
export function EvidenceBody({ provenance, item, onOpenSource }) {
  const byRef = new Map((provenance?.providedSources ?? []).map((s) => [s.refId, s]));
  const linked = (item?.refIds ?? []).map((refId) => byRef.get(refId)).filter(Boolean);
  const calculations = (provenance?.serverCalculations ?? [])
    .filter((c) => (item?.serverCalculationIds ?? []).includes(c.calculationId));

  return (
        <div className="plan-evidence-body">
          {!item?.recorded && (
            <p className="muted">이 항목에는 생성 당시 근거 기록이 없어요.</p>
          )}

          {item?.recorded && (item.staleReasons ?? []).map((reason) => (
            <p key={reason} className="plan-evidence-stale">{reason}</p>
          ))}
          {/*
            적용된 뒤 사용자가 옮기거나 줄인 것. 근거 자체는 그대로이고, 지금 보이는 배치·분량이
            그때 제안과 다르다는 뜻이다. 숨기면 사용자는 자기가 정한 시각을 AI가 낸 것으로 읽는다.
          */}
          {(item?.afterApplyChanges ?? []).map((change) => (
            <p key={change} className="plan-evidence-stale">{change}</p>
          ))}

          {item?.recorded && (
            <>
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
                {item.unknownRefCount > 0 && (
                  <p className="plan-evidence-dropped">
                    AI가 이번 생성에 없던 출처 {item.unknownRefCount}건을 함께 적어서 그건 뺐어요.
                  </p>
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

              <section>
                <h5>AI가 판단한 것</h5>
                {item.reason && <p className="plan-evidence-reason">{item.reason}</p>}
                {(item.aiEstimates ?? []).length > 0 && (
                  <ul>
                    {item.aiEstimates.map((estimate) => <li key={estimate}>{estimate}</li>)}
                  </ul>
                )}
                {!item.reason && (item.aiEstimates ?? []).length === 0 && (
                  <p className="muted">따로 적은 판단이 없어요.</p>
                )}
                <p className="hint">확인된 인과관계가 아니라 AI가 그렇게 봤다는 뜻이에요.</p>
              </section>
            </>
          )}
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

/**
 * 프롬프트 줄 끝의 인용 번호를 뗀다. 그건 AI가 줄을 가리키라고 붙인 표식이지
 * 사용자에게 보일 값이 아니다.
 */
function stripRef(promptLine) {
  if (!promptLine) return '';
  return promptLine.replace(/\s*\[s\d+]\s*$/, '');
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
