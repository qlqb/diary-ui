/**
 * 자료 하나의 세 단계를 글자로 보여 준다: 등록 / 텍스트 추출 / 내용 분석.
 *
 * 네 번째였던 "구조 제안(연결)"은 뺐다(2026-09-21) — 자동으로 도는 일이 아니라 프로젝트 화면에서
 * 사용자가 누를 때 하는 일이라, 단계로 두면 누르지도 않은 일이 밀린 것처럼 보였다.
 *
 * 색 점만 찍지 않는다 — 단계마다 "완료·진행 중·대기·안 됨"이 글자로 있다. 기다리는 이유가 있으면
 * 그 한 줄을 아래에 붙인다(한도 대기는 실패처럼 보이면 안 된다).
 */

import { materialStages, STAGE_STATE_LABEL, TIDY_IS_OPTIONAL, waitingCopy } from '../../lib/materialStages.js';
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
      {/*
        내용 분석이 끝난 자료에는 "다음에 뭘 해야 하나"가 남는다. 예전에는 네 번째 단계("구조 제안")가
        그 자리를 차지했는데, 그건 자동으로 도는 일이 아니라 사용자가 고르는 일이라 단계로 두면
        누르지도 않은 일이 밀린 것처럼 보였다. 한 줄 안내로 바꾼다.
      */}
      {stages[2]?.state === 'done' && <p className="material-stage-next">{TIDY_IS_OPTIONAL}</p>}
    </div>
  );
}
