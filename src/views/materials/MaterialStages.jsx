/**
 * 자료 하나의 네 단계를 글자로 보여 준다: 등록 / 텍스트 추출 / 내용 분석 / 구조 제안(연결).
 *
 * 색 점만 찍지 않는다 — 단계마다 "완료·진행 중·대기·안 됨"이 글자로 있다. 기다리는 이유가 있으면
 * 그 한 줄을 아래에 붙인다(한도 대기는 실패처럼 보이면 안 된다).
 */

import { materialStages, STAGE_STATE_LABEL, waitingCopy } from '../../lib/materialStages.js';
import '../../styles/material-status.css';

export default function MaterialStages({ material, status, limit = null }) {
  const stages = materialStages(material, status);
  const waiting = waitingCopy(status?.waitingReason ?? null, limit);
  return (
    <div className="material-stages">
      <ol className="material-stage-list" aria-label={`${material?.originalFilename ?? '자료'} 처리 단계`}>
        {stages.map((stage) => (
          <li key={stage.title} className={`material-stage is-${stage.state}`}>
            <span className="material-stage-title">{stage.title}</span>
            <span className="material-stage-state">
              {STAGE_STATE_LABEL[stage.state]}{stage.note ? ` · ${stage.note}` : ''}
            </span>
          </li>
        ))}
      </ol>
      {waiting && <p className="material-stage-waiting" role="status">{waiting.detail}</p>}
    </div>
  );
}
