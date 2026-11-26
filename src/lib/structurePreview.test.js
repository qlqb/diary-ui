import { describe, expect, it } from 'vitest';
import { previewStructure, hasStructureChange } from './structurePreview.js';

const TREE = [
  { topicId: 1, parentTopicId: null, title: '3장 스택', orderIndex: 0 },
  { topicId: 2, parentTopicId: null, title: '4장 큐', orderIndex: 1 },
  { topicId: 3, parentTopicId: null, title: '5장 연결 리스트', orderIndex: 2 },
  { topicId: 4, parentTopicId: 3, title: '단순 연결 리스트', orderIndex: 0 },
];

const change = (changeId, op, payload, extra = {}) => ({ changeId, op, payload: { op, ...payload }, ...extra });

describe('previewStructure', () => {
  it('고른 변경만 반영하고, 실제 수업 정정은 구조가 아니라 표시로 남는다', () => {
    const changes = [
      change('a', 'MOVE', { topicId: 2, parentTopicId: null, afterTopicId: 0 }),
      change('b', 'RENAME', { topicId: 4, title: '5.1 단순 연결 리스트' }),
      change('c', 'CLASS', { topicId: 3, week: 2, afterTopicId: 0 }),
      change('d', 'SCOPE_EXCLUDE', { topicId: 2, label: '중간고사' }),
    ];
    const { before, after } = previewStructure(TREE, changes, new Set(['a', 'c', 'd']));

    expect(before.map((n) => n.title)).toEqual(['3장 스택', '4장 큐', '5장 연결 리스트']);
    expect(after.map((n) => n.title)).toEqual(['4장 큐', '3장 스택', '5장 연결 리스트']);
    expect(after[0].status).toBe('moved');
    expect(after[0].marks).toEqual(['중간고사 범위에서 뺌']);
    // 5장은 순서가 그대로다(교재 구조) — 실제 수업 주차는 표시로만.
    expect(after[2].marks).toEqual(['실제 수업 2주차']);
    // 고르지 않은 이름 변경은 반영하지 않는다.
    expect(after[2].children[0].title).toBe('단순 연결 리스트');
    expect(hasStructureChange(after)).toBe(true);
  });

  it('분할·병합·새 항목을 보여 주고, 병합된 항목은 지우지 않고 표시한다', () => {
    const changes = [
      change('s', 'SPLIT', { topicId: 1, children: [{ tempId: 'n1', title: '스택 개념' }, { tempId: 'n2', title: '스택 구현' }] }),
      change('m', 'MERGE', { survivingTopicId: 3, absorbedTopicIds: [2] }),
      change('x', 'ADD', { tempId: 't1', parentTopicId: null, title: '6장 트리', children: [{ tempId: 't2', title: '6.1 이진 트리' }] }),
    ];
    const { after } = previewStructure(TREE, changes, new Set(['s', 'm', 'x']));

    expect(after[0].children.map((n) => n.title)).toEqual(['스택 개념', '스택 구현']);
    expect(after[0].children.every((n) => n.status === 'added')).toBe(true);
    const queue = after.find((n) => n.title === '4장 큐');
    expect(queue.status).toBe('absorbed');
    expect(queue.marks[0]).toContain('5장 연결 리스트');
    const tree6 = after.find((n) => n.title === '6장 트리');
    expect(tree6.children[0].title).toBe('6.1 이진 트리');
  });

  it('아무것도 고르지 않으면 바뀐 곳이 없다', () => {
    const { after } = previewStructure(TREE, [change('a', 'MOVE', { topicId: 2, parentTopicId: null, afterTopicId: 0 })], new Set());
    expect(hasStructureChange(after)).toBe(false);
  });
});
