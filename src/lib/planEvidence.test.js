import { describe, it, expect } from 'vitest';
import {
  buildEvidenceSummary, countScopeNodes, materialActionLabel, locatorHint, stripRef,
} from './planEvidence.js';

/**
 * 묶기 규칙. 여기서 막으려는 것은 "그럴듯하게 합쳐서 없는 사실을 만드는" 실패다 —
 * 제목이 같은 다른 자료를 하나로, 떨어진 위치를 연속 범위로, 문자열 유사성으로 계층을.
 */

const pdf = (materialId, filename, locator, extra = {}) => ({
  materialId, recordedMaterialId: materialId, filename, currentFilename: filename,
  contentType: 'application/pdf', locator, origin: 'RECORDED', state: 'AVAILABLE',
  openMode: 'INLINE', note: null, ...extra,
});

const topic = (refId, sourceId, title, locator, { parentSourceId = null, material = null, courseId = 6 } = {}) => ({
  refId, sourceType: 'TOPIC', sourceId, parentSourceId, representation: 'SELECTED_FIELDS',
  providedValue: { courseId, title, sourceLocator: locator },
  promptLine: `  - ${title}${locator ? ` (${locator})` : ''} [${refId}]`,
  link: { available: true, target: 'TOPIC', targetId: sourceId },
  material,
});

const course = (refId, sourceId, title) => ({
  refId, sourceType: 'COURSE', sourceId, representation: 'SELECTED_FIELDS',
  providedValue: { title }, promptLine: `- id=${sourceId} ${title} [${refId}]`,
  link: { available: true, target: 'COURSE', targetId: sourceId },
});

const provenanceWith = (sources) => ({ recorded: true, providedSources: sources, serverCalculations: [] });
const itemWith = (refIds, extra = {}) => ({
  recorded: true, refIds, reason: '2주차 진도라서', aiEstimates: ['예상 소요 시간 40분'],
  serverCalculationIds: [], evidenceStatus: 'CURRENT', staleReasons: [], unknownRefCount: 0,
  afterApplyChanges: [], ...extra,
});

describe('학습 범위 묶기', () => {
  it('부모와 하위 항목 4개가 같은 자료면 범위 묶음 하나와 원문 액션 하나가 된다', () => {
    const file = pdf(657, '네트워크 2주차.pdf', '2주차');
    const sources = [
      course('s1', 6, '네트워크프로그래밍'),
      topic('s2', 101, '네트워크와 소켓 프로그래밍', '2주차', { material: file }),
      topic('s3', 102, 'TCP/IP 프로토콜의 개요', '2주차', { parentSourceId: 101, material: file }),
      topic('s4', 103, '소켓의 개념', '2주차', { parentSourceId: 101, material: file }),
      topic('s5', 104, '소켓의 특징과 구조', '2주차', { parentSourceId: 101, material: file }),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s1', 's2', 's3', 's4', 's5']));

    expect(summary.scope.kind).toBe('STUDY');
    expect(summary.scope.courseTitle).toBe('네트워크프로그래밍');
    expect(summary.scope.weekLabel).toBe('2주차');
    expect(summary.scope.groups).toHaveLength(1);
    expect(summary.scope.groups[0].title).toBe('네트워크와 소켓 프로그래밍');
    expect(summary.scope.groups[0].children.map((c) => c.title))
      .toEqual(['TCP/IP 프로토콜의 개요', '소켓의 개념', '소켓의 특징과 구조']);
    // 공통 주차로 올라갔으니 항목 옆에는 반복하지 않는다.
    expect(summary.scope.groups[0].locator).toBeNull();
    expect(summary.scope.groups[0].children.every((c) => c.locator === null)).toBe(true);

    expect(summary.materials).toHaveLength(1);
    expect(summary.materials[0].filename).toBe('네트워크 2주차.pdf');
    expect(summary.materials[0].locators).toEqual(['2주차']);
    expect(summary.materials[0].refIds).toEqual(['s2', 's3', 's4', 's5']);
    expect(materialActionLabel(summary.materials[0])).toBe('원본 자료 열기');
  });

  it('부모가 이 항목에 연결되지 않았으면 자식을 부모 아래로 끌어오지 않는다', () => {
    const sources = [
      topic('s2', 101, '네트워크와 소켓 프로그래밍', '2주차'),
      topic('s3', 102, 'TCP/IP 프로토콜의 개요', '2주차', { parentSourceId: 101 }),
    ];
    // 항목은 자식(s3)만 인용했다.
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s3']));

    expect(summary.scope.groups).toHaveLength(1);
    expect(summary.scope.groups[0].title).toBe('TCP/IP 프로토콜의 개요');
    expect(summary.scope.groups[0].children).toEqual([]);
  });

  it('제목이 비슷해도 당시 구조(parentSourceId)가 없으면 계층을 만들지 않는다', () => {
    const sources = [
      topic('s2', 101, '소켓', '2주차'),
      topic('s3', 102, '소켓의 개념', '2주차'),
      topic('s4', 103, '소켓의 특징', '2주차'),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s2', 's3', 's4']));

    expect(summary.scope.groups.map((g) => g.title)).toEqual(['소켓', '소켓의 개념', '소켓의 특징']);
    expect(summary.scope.groups.every((g) => g.children.length === 0)).toBe(true);
  });

  it('주차가 서로 다르면 하나로 통일하지 않고 항목 옆에 각각 둔다', () => {
    const sources = [
      topic('s2', 101, '재귀', '2주차'),
      topic('s3', 102, '정렬', '3주차'),
      topic('s4', 103, '탐색', null),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s2', 's3', 's4']));

    expect(summary.scope.weekLabel).toBeNull();
    expect(summary.scope.groups.map((g) => g.locator)).toEqual(['2주차', '3주차', null]);
  });

  it('프로젝트가 여럿 섞이면 프로젝트 제목을 하나로 말하지 않는다', () => {
    const sources = [
      course('s1', 6, '자료구조'), course('s2', 7, '운영체제'),
      topic('s3', 101, '재귀', '2주차', { courseId: 6 }), topic('s4', 201, '프로세스', '3주차', { courseId: 7 }),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s1', 's2', 's3', 's4']));
    expect(summary.scope.courseTitle).toBeNull();
  });
});

describe('학습 범위 — 여러 단계', () => {
  const titlesOf = (groups) => {
    const titles = [];
    const walk = (node) => { titles.push(node.title); node.children.forEach(walk); };
    groups.forEach(walk);
    return titles.sort();
  };

  it('3단계(A > B > C)를 전부 인용하면 C도 기본 범위에 남는다', () => {
    const sources = [
      topic('s1', 1, 'A', null),
      topic('s2', 2, 'B', null, { parentSourceId: 1 }),
      topic('s3', 3, 'C', null, { parentSourceId: 2 }),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s1', 's2', 's3']));

    expect(summary.scope.groups).toHaveLength(1);
    const a = summary.scope.groups[0];
    expect(a.title).toBe('A');
    expect(a.children.map((c) => c.title)).toEqual(['B']);
    expect(a.children[0].children.map((c) => c.title)).toEqual(['C']);
    expect(countScopeNodes(a)).toBe(3);
  });

  it('4단계와 여러 분기도 인용된 항목을 하나도 잃지 않는다', () => {
    const sources = [
      topic('s1', 1, 'A', null),
      topic('s2', 2, 'B1', null, { parentSourceId: 1 }),
      topic('s3', 3, 'B2', null, { parentSourceId: 1 }),
      topic('s4', 4, 'C', null, { parentSourceId: 2 }),
      topic('s5', 5, 'D', null, { parentSourceId: 4 }),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s1', 's2', 's3', 's4', 's5']));

    expect(summary.scope.groups).toHaveLength(1);
    expect(countScopeNodes(summary.scope.groups[0])).toBe(5);
    expect(titlesOf(summary.scope.groups)).toEqual(['A', 'B1', 'B2', 'C', 'D']);
  });

  it('중간 부모가 인용되지 않았으면 그 아래 항목은 뿌리로 올라오고 부모를 끌어오지 않는다', () => {
    const sources = [
      topic('s1', 1, 'A', null),
      topic('s2', 2, 'B', null, { parentSourceId: 1 }),
      topic('s3', 3, 'C', null, { parentSourceId: 2 }),
    ];
    // B는 인용되지 않았다.
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s1', 's3']));

    expect(summary.scope.groups.map((g) => g.title)).toEqual(['A', 'C']);
    expect(summary.scope.groups[0].children).toEqual([]);
    expect(summary.linkedCount).toBe(2);
  });

  it('같은 ref를 두 번 인용해도 한 번만 나온다', () => {
    const sources = [topic('s1', 1, 'A', null), topic('s2', 2, 'B', null, { parentSourceId: 1 })];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s1', 's2', 's2', 's1']));

    expect(summary.scope.groups).toHaveLength(1);
    expect(summary.scope.groups[0].children).toHaveLength(1);
    expect(summary.linkedCount).toBe(2);
  });

  it('순환(A>B>A)이나 자기 자신을 가리키는 관계에서도 멈추지 않고 항목을 보존한다', () => {
    const cyclic = [
      topic('s1', 1, 'A', null, { parentSourceId: 2 }),
      topic('s2', 2, 'B', null, { parentSourceId: 1 }),
      topic('s3', 3, 'C', null, { parentSourceId: 3 }),
    ];
    const summary = buildEvidenceSummary(provenanceWith(cyclic), itemWith(['s1', 's2', 's3']));
    expect(titlesOf(summary.scope.groups)).toEqual(['A', 'B', 'C']);
  });

  it('부모 id가 인용되지 않은 다른 항목을 가리키는 고아도 뿌리로 남는다', () => {
    const sources = [topic('s1', 1, 'A', null, { parentSourceId: 999 })];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s1']));
    expect(summary.scope.groups.map((g) => g.title)).toEqual(['A']);
  });
});

describe('자료 묶기', () => {
  it('제목이 같은 서로 다른 자료는 서로 다른 출처로 남는다', () => {
    const a = pdf(657, '강의자료.pdf', '2주차');
    const b = pdf(658, '강의자료.pdf', '2주차');
    const sources = [
      topic('s2', 101, '재귀', '2주차', { material: a }),
      topic('s3', 102, '정렬', '2주차', { material: b }),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s2', 's3']));

    expect(summary.materials).toHaveLength(2);
    expect(summary.materials.map((m) => m.materialId)).toEqual([657, 658]);
  });

  it('같은 파일의 떨어진 위치는 목록으로 남고 가짜 연속 범위가 되지 않는다', () => {
    const sources = [
      topic('s2', 101, '재귀', '3쪽', { material: pdf(657, '교재.pdf', '3쪽') }),
      topic('s3', 102, '정렬', '9쪽', { material: pdf(657, '교재.pdf', '9쪽') }),
      topic('s4', 103, '탐색', '3쪽', { material: pdf(657, '교재.pdf', '3쪽') }),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s2', 's3', 's4']));

    expect(summary.materials).toHaveLength(1);
    expect(summary.materials[0].locators).toEqual(['3쪽', '9쪽']);
    expect(locatorHint(summary.materials[0].locators)).toBe('3쪽 · 9쪽 확인');
    expect(locatorHint(summary.materials[0].locators)).not.toContain('~');
  });

  it('"2주차"는 페이지가 아니다 — 안내 문구는 확인만 부탁하고 이동을 약속하지 않는다', () => {
    expect(locatorHint(['2주차'])).toBe('2주차 확인');
    expect(locatorHint([])).toBeNull();
  });

  it('PDF는 열기, PPTX는 내려받기, 열 수 없는 자료는 버튼이 없다', () => {
    expect(materialActionLabel(pdf(1, 'a.pdf', null))).toBe('원본 자료 열기');
    expect(materialActionLabel(pdf(2, 'a.pptx', null, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      openMode: 'DOWNLOAD',
    }))).toBe('파일 내려받기');
    expect(materialActionLabel(pdf(null, 'a.pdf', null, { openMode: 'NONE', state: 'DELETED' }))).toBeNull();
  });

  it('회차에 제공된 다른 자료는 이 항목의 근거로 승격하지 않는다', () => {
    const sources = [
      topic('s2', 101, '재귀', '2주차', { material: pdf(657, '자료구조.pdf', '2주차') }),
      topic('s3', 201, '프로세스', '3주차', { material: pdf(700, '운영체제.pdf', '3주차') }),
    ];
    const summary = buildEvidenceSummary(provenanceWith(sources), itemWith(['s2']));

    expect(summary.materials.map((m) => m.materialId)).toEqual([657]);
    expect(summary.linkedCount).toBe(1);
  });

  it('자료 연결이 없는 항목에는 자료가 없고, 원본 정보가 아예 없으면 범위도 없다', () => {
    const sources = [
      { refId: 's1', sourceType: 'COMMITMENT', sourceId: 17, providedValue: { label: '근무' }, promptLine: '9/11 목 18:00~23:00 근무 [s1]' },
    ];
    const conditions = buildEvidenceSummary(provenanceWith(sources), itemWith(['s1']));
    expect(conditions.scope.kind).toBe('CONDITIONS');
    expect(conditions.scope.conditions[0].text).toBe('9/11 목 18:00~23:00 근무');
    expect(conditions.materials).toEqual([]);

    const none = buildEvidenceSummary(provenanceWith(sources), itemWith([]));
    expect(none.scope.kind).toBe('NONE');
  });
});

describe('자료 묶기 — 일부 재연결', () => {
  const same = pdf(10, '옛 자료.pdf', '2주차');
  const relinked = {
    ...pdf(10, '옛 자료.pdf', '2주차'),
    materialId: 20,
    currentFilename: '새 자료.pdf',
    state: 'RELINKED',
    note: '생성 당시와 다른 자료가 연결돼 있어요 · 현재 파일을 열어요',
  };

  const summarize = (order) => buildEvidenceSummary(provenanceWith([
    topic('s1', 101, '재귀', '2주차', { material: same }),
    topic('s2', 102, '정렬', '2주차', { material: relinked }),
  ]), itemWith(order));

  const shape = (summary) => summary.materials.map((m) => ({
    recorded: m.recordedMaterialId, current: m.materialId, state: m.state, note: m.note,
    topics: [...m.topicTitles].sort(), refs: [...m.refIds].sort(), split: m.split,
  }));

  it('같은 당시 자료라도 지금 파일·상태가 다르면 행을 나누고, 각 행이 어느 주제인지 안다', () => {
    const summary = summarize(['s1', 's2']);

    expect(summary.materials).toHaveLength(2);
    expect(shape(summary)).toEqual([
      { recorded: 10, current: 10, state: 'AVAILABLE', note: null, topics: ['재귀'], refs: ['s1'], split: true },
      { recorded: 10, current: 20, state: 'RELINKED', note: relinked.note, topics: ['정렬'], refs: ['s2'], split: true },
    ]);
    // 재연결 행은 새 파일(20)을 열고, 당시 파일명·위치를 유지한다.
    expect(summary.materials[1].filename).toBe('옛 자료.pdf');
    expect(summary.materials[1].currentFilename).toBe('새 자료.pdf');
    expect(summary.materials[1].locators).toEqual(['2주차']);
  });

  it('인용 순서를 뒤집어도 같은 집합이 같은 순서로 보인다', () => {
    expect(shape(summarize(['s2', 's1']))).toEqual(shape(summarize(['s1', 's2'])));
  });

  it('둘 다 같은 새 파일로 재연결됐으면 한 행이고 열기 버튼도 하나다', () => {
    const summary = buildEvidenceSummary(provenanceWith([
      topic('s1', 101, '재귀', '2주차', { material: relinked }),
      topic('s2', 102, '정렬', '3주차', { material: { ...relinked, locator: '3주차' } }),
    ]), itemWith(['s1', 's2']));

    expect(summary.materials).toHaveLength(1);
    expect(summary.materials[0].materialId).toBe(20);
    expect(summary.materials[0].locators).toEqual(['2주차', '3주차']);
    expect(summary.materials[0].split).toBe(false);
  });

  it('각각 다른 새 파일로 재연결됐으면 두 행이고 각 행이 자기 파일을 연다', () => {
    const summary = buildEvidenceSummary(provenanceWith([
      topic('s1', 101, '재귀', '2주차', { material: relinked }),
      topic('s2', 102, '정렬', '2주차', { material: { ...relinked, materialId: 30, currentFilename: '더 새 자료.pdf' } }),
    ]), itemWith(['s1', 's2']));

    expect(summary.materials.map((m) => m.materialId)).toEqual([20, 30]);
    expect(summary.materials.map((m) => m.topicTitles)).toEqual([['재귀'], ['정렬']]);
  });

  it('정상 파일과 접근할 수 없는 파일이 섞이면 접근 불가 행이 정상 링크를 물려받지 않는다', () => {
    const deleted = {
      ...pdf(10, '옛 자료.pdf', '2주차'), materialId: null, state: 'DELETED', openMode: 'NONE', note: '원본 자료가 지워졌어요',
    };
    const summary = buildEvidenceSummary(provenanceWith([
      topic('s1', 101, '재귀', '2주차', { material: same }),
      topic('s2', 102, '정렬', '2주차', { material: deleted }),
    ]), itemWith(['s1', 's2']));

    expect(summary.materials).toHaveLength(2);
    const gone = summary.materials.find((m) => m.state === 'DELETED');
    expect(gone.materialId).toBeNull();
    expect(materialActionLabel(gone)).toBeNull();
    expect(materialActionLabel(summary.materials.find((m) => m.state === 'AVAILABLE'))).toBe('원본 자료 열기');
  });

  it('다른 자료 id의 같은 파일명은 여전히 다른 행이다', () => {
    const summary = buildEvidenceSummary(provenanceWith([
      topic('s1', 101, '재귀', '2주차', { material: pdf(10, '강의자료.pdf', '2주차') }),
      topic('s2', 102, '정렬', '2주차', { material: pdf(11, '강의자료.pdf', '2주차') }),
    ]), itemWith(['s1', 's2']));
    expect(summary.materials.map((m) => m.recordedMaterialId)).toEqual([10, 11]);
    expect(summary.materials.every((m) => m.split === false)).toBe(true);
  });
});

describe('AI의 판단', () => {
  it('이유와 같은 문장인 추정은 한 번만 두고, 나머지는 그대로 둔다', () => {
    const summary = buildEvidenceSummary(provenanceWith([]), itemWith([], {
      reason: '핵심 개념 4개를 정리하는 복습',
      aiEstimates: ['핵심 개념 4개를 정리하는 복습', '예상 소요 시간 40분', '예상 소요 시간 40분'],
    }));
    expect(summary.ai.reason).toBe('핵심 개념 4개를 정리하는 복습');
    expect(summary.ai.estimates).toEqual(['예상 소요 시간 40분']);
  });

  it('인용 번호와 앞의 불릿을 뗀다', () => {
    expect(stripRef('  - 소켓의 개념 (2주차) [s2]')).toBe('소켓의 개념 (2주차)');
    expect(stripRef(null)).toBe('');
  });
});
