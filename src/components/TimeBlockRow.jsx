/**
 * 시간만 차지하는 줄.
 *
 * 실행 조각이 아니다 — 완료/일부/줄이기/이동이 없다. 수업을 "완료"하는 것은 뜻이
 * 통하지 않고, 여기서 고칠 수 있게 하면 반복 규칙 전체를 이 줄에서 바꾸는 셈이 된다.
 * 고치려면 일정 탭으로 간다.
 *
 * 색만으로 구분하지 않는다. 지금 주간 격자의 반복 일정 배경(#f1f3f6)은 종일 칩(#f2f4f7)과
 * 사실상 같은 회색이라, 색을 옮겨 와도 "왜 이 줄만 버튼이 없지"에 답이 되지 않는다.
 * 무엇인지를 글자로 말한다.
 *
 * kind를 늘리면 라벨만 추가하면 된다 — 일회성 약속(COMMITMENT)이 다음에 여기로 들어온다.
 */

import { Repeat } from 'lucide-react';
import { toHHmm } from '../lib/datetime.js';

const KIND_LABEL = {
  ROUTINE: '반복 일정',
};

export default function TimeBlockRow({ entry, running = false, compact = false }) {
  return (
    <article className={`exec-row is-block${running ? ' is-running' : ''}${compact ? ' is-compact' : ''}`}>
      <div className="exec-row-main">
        <div className="exec-row-headline">
          <span className="exec-row-time block-row-range">
            {toHHmm(entry.startAt)}–{toHHmm(entry.endAt)}
          </span>
          <span className="exec-row-title">{entry.title}</span>
        </div>
        <div className="exec-row-meta">
          <span className="chip chip-block">
            <Repeat size={11} /> {KIND_LABEL[entry.kind] ?? '일정'}
          </span>
          {running && <span className="exec-row-dim">진행 중</span>}
          {entry.location && <span className="exec-row-dim">{entry.location}</span>}
        </div>
      </div>
    </article>
  );
}
