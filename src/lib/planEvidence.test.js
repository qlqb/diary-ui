import { describe, it, expect } from 'vitest';
import {
  buildEvidenceSummary, materialActionLabel, locatorHint, stripRef,
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
