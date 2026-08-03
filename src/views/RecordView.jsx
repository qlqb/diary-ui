/**
 * 기록 탭.
 *
 * 책임: 이미 발생하고 사용자가 확정한 ExecutionRecord 를 조회하고 해석한다.
 * 핵심 질문: 실제로 무슨 일이 있었고, 다음 판단에 무엇을 반영할까?
 *
 * 흐름: 실제 결과 발생 -> 기록함 -> 기간별 해석 -> 돌아보기 -> 반복된 차이 -> 패턴 후보
 *
 * 실제 결과 입력은 주로 오늘 화면에서 발생한다.
 * 여기는 승인된 결과를 모아 보고 해석하는 장소다.
 */

import { useState } from 'react';
import { ViewHeader, SubTabs, EmptyState } from './shared.jsx';
import {
  selectRecords,
  MOCK_EXECUTION_RECORDS,
  MOCK_EXECUTION_EVENTS,
} from '../mock/executionMock.js';
import { RESULT_TYPE_LABEL, EVENT_TYPE_LABEL } from '../types/execution.js';

const SUB_TABS = [
  { key: 'inbox', label: '기록함' },
  { key: 'review', label: '돌아보기' },
  { key: 'pattern', label: '패턴' },
];

export default function RecordView() {
  const [sub, setSub] = useState('inbox');
  const records = selectRecords(MOCK_EXECUTION_RECORDS);

  return (
    <div className="v6-view">
      <ViewHeader
        title="기록"
        question="실제로 무슨 일이 있었고, 다음 판단에 무엇을 반영할까?"
      />
      <SubTabs tabs={SUB_TABS} active={sub} onChange={setSub} />

      {sub === 'inbox' && (
        <section className="v6-section">
          <h2 className="v6-section-title">확정된 결과</h2>
          {records.length === 0 ? (
            <EmptyState title="아직 기록이 없어요" />
          ) : (
            <div className="v6-item-list">
              {records.map((r) => (
                <article className="v6-item-card" key={r.executionRecordId}>
                  <div className="v6-item-main">
                    <p className="v6-item-title-plain">{r.title}</p>
                    <div className="v6-item-meta">
                      <span className="v6-item-status">
                        {RESULT_TYPE_LABEL[r.resultType]}
                      </span>
                      <span className="v6-item-placement">{r.recordDate}</span>
                      {r.actualMinutes != null && (
                        <span className="v6-item-tag">{r.actualMinutes}분</span>
                      )}
                      {r.actualAmount && (
                        <span className="v6-item-tag">{r.actualAmount}</span>
                      )}
                      {r.executionItemId == null && (
                        <span className="v6-item-tag">계획 밖</span>
                      )}
                    </div>
                    {r.memo && <p className="v6-item-memo">{r.memo}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {sub === 'review' && (
        <EmptyState
          title="돌아보기는 다음 단계에서 연결해요"
          desc="선택한 기간의 사실에 사용자가 의미를 붙이는 자리예요."
        />
      )}

      {sub === 'pattern' && (
        <section className="v6-section">
          <h2 className="v6-section-title">반복된 조정</h2>
          <p className="v6-section-desc">
            계획과 실제의 차이를 사실 그대로 모았어요. 판단은 직접 하시면 돼요.
          </p>
          <div className="v6-item-list">
            {MOCK_EXECUTION_EVENTS.map((e) => (
              <article className="v6-item-card" key={e.executionItemEventId}>
                <div className="v6-item-main">
                  <p className="v6-item-title-plain">
                    {EVENT_TYPE_LABEL[e.eventType]}
                  </p>
                  <div className="v6-item-meta">
                    <span className="v6-item-placement">{e.eventDate}</span>
                    <span className="v6-item-tag">관련 기록 1건</span>
                  </div>
                  {e.memo && <p className="v6-item-memo">{e.memo}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
