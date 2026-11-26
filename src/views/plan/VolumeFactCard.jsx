/**
 * 초안 항목 하나의 분량 3층(사실 → 제안 → 관점). 문장과 조건은 lib/volumeFact.js가 정한다.
 * 확정을 막지 않는다 — 정하는 사람은 사용자다. 제안을 받으면 그 항목의 예상 시간만 고친다(기존 "시간 고치기"와 같은 길).
 */
import { formatDateShort } from '../../lib/datetime.js';
import { formatMinutesKo } from '../../lib/planTime.js';

import { Button } from '@mantine/core';
export default function VolumeFactCard({ fact, itemTitle = '', onAccept, onKeep }) {
  if (!fact) return null;
  return (
    // 카드가 여러 항목에 나올 수 있어 이름에 항목 제목을 넣는다(화면 낭독기에서 어느 항목의 선택인지 구별되게).
    <div className="volume-fact" role="group" aria-label={itemTitle ? `${itemTitle} 분량 확인` : '분량 확인'}>
      <p className="volume-fact-layer"><span className="volume-fact-label">사실</span>{fact.fact}</p>
      <p className="volume-fact-weeks">
        {fact.weeks.map((w) => `${formatDateShort(w.date)} ${formatMinutesKo(w.actual)}`).join(' · ')}
      </p>
      <p className="volume-fact-layer"><span className="volume-fact-label">제안</span>{fact.suggestion}</p>
      <div className="volume-fact-actions">
        <Button size="xs" type="button" onClick={onAccept}
          aria-label={itemTitle ? `${itemTitle}: ${formatMinutesKo(fact.suggestedMinutes)}으로 둘게요` : undefined}>
          {formatMinutesKo(fact.suggestedMinutes)}으로 둘게요
        </Button>
        <Button variant="default" size="xs" type="button" onClick={onKeep}
          aria-label={itemTitle ? `${itemTitle}: 그대로 둘게요` : undefined}>그대로 둘게요</Button>
      </div>
      {fact.perspective && <p className="volume-fact-perspective">{fact.perspective}</p>}
    </div>
  );
}
