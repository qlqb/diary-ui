import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  ACTION_TYPE_LABEL, PRIORITY_LABEL, TREATMENT_LABEL,
} from '../../lib/planLabels.js';

/**
 * 계획 화면이 사용자에게 하는 말을 검사한다.
 *
 * 왜 테스트로 강제하는가. 이 앱이 다루는 것은 "못 한 일"이고, 그것을 말하는 방식이 앱의
 * 성격을 정한다. "이행률 40%"와 "네 개 중 두 개를 했어요"는 같은 사실을 다르게 만든다.
 * 코드 리뷰로만 지키면 급할 때 새어 들어오고, 한 번 새면 그 표현이 기준이 된다.
 *
 * 「이미 알아요 / 처음이에요」는 익숙함의 진술이지 능력 판정이 아니다. 그래서 "수준",
 * "실력", "초급/중급/고급"이 금지어에 있다.
 */

/** 사용자를 평가하거나 못 한 것을 나무라는 말. 사실을 말할 때도 이 단어들은 쓰지 않는다. */
const FORBIDDEN = ['실패', '미완료', '부족', '이행률', '수준', '실력', '초급', '중급', '고급', '뒤처', '밀린'];

/** enum 원문. 서버가 값을 구분하려고 쓰는 이름이지 사용자에게 할 말이 아니다. */
const ENUM_LITERALS = [
  ...Object.keys(PRIORITY_LABEL),
  ...Object.keys(TREATMENT_LABEL),
  ...Object.keys(ACTION_TYPE_LABEL),
  'SKIP', 'KNOWN', 'DEFER', 'SERVER', 'DEFAULT', 'MODEL',
];

const PLAN_DIR = join(process.cwd(), 'src/views/plan');
const LABELS_FILE = join(process.cwd(), 'src/lib/planLabels.js');

function sourceFiles() {
  return readdirSync(PLAN_DIR)
    .filter((name) => name.endsWith('.jsx') && !name.endsWith('.test.jsx'))
    .map((name) => join(PLAN_DIR, name));
}

/**
 * JSX에서 사용자에게 보이는 문자열만 남긴다.
 *
 * 주석은 뺀다 — 주석은 왜 그렇게 했는지를 적는 자리이고, 거기서 "부족"이나 "실패"를
 * 설명에 쓰는 것은 막을 이유가 없다. 막으면 오히려 이유를 못 적게 된다.
 */
function visibleText(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('계획 화면의 카피', () => {
  it.each(sourceFiles())('%s 에 사용자를 평가하는 말이 없다', (file) => {
    const text = visibleText(readFileSync(file, 'utf8'));

    const found = FORBIDDEN.filter((word) => text.includes(word));
    expect(found, `금지어가 남아 있다: ${found.join(', ')}`).toEqual([]);
  });

  it('표시 문구 모음에도 평가하는 말이 없다', () => {
    const text = visibleText(readFileSync(LABELS_FILE, 'utf8'));

    expect(FORBIDDEN.filter((word) => text.includes(word))).toEqual([]);
  });

  it('enum 원문을 화면에 직접 쓰지 않는다 — 번역은 planLabels 한 곳을 지난다', () => {
    for (const file of sourceFiles()) {
      const text = visibleText(readFileSync(file, 'utf8'));
      // JSX 텍스트 노드로 새어 나온 enum. `>MUST<` 같은 모양만 잡는다 —
      // 비교문(item.priority === 'MUST')은 값을 구분하는 코드이지 표시가 아니다.
      for (const literal of ENUM_LITERALS) {
        expect(text, `${file}에 enum 원문이 그대로 노출됐다: ${literal}`)
          .not.toMatch(new RegExp(`>\\s*${literal}\\s*<`));
      }
    }
  });

  it('번역표는 서버 enum을 빠짐없이 덮는다 — 빠지면 그 값이 그대로 화면에 뜬다', () => {
    expect(Object.keys(PRIORITY_LABEL)).toEqual(['MUST', 'SHOULD', 'OPTIONAL']);
    expect(Object.keys(TREATMENT_LABEL)).toEqual(['FULL', 'SKIM', 'REVIEW']);
    expect(Object.keys(ACTION_TYPE_LABEL)).toEqual(['READ', 'PRACTICE', 'RECALL', 'LAB']);
  });
});
