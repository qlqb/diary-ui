/**
 * 정리안을 적용하면 학습 구조가 어떻게 되는지 화면에서 미리 계산한다(서버 호출 없음).
 *
 * 서버의 적용 순서를 그대로 따른다: 이름 변경 → 이동 → 추가 → 분할 → 연결 → 병합 → 실제 수업 진행 → 자료 주차 → 범위 제외.
 * 고른 변경만 반영하고, 교재 구조(트리)와 실제 수업 정정(주차·순서·범위)을 섞지 않는다 — 정정은 항목 옆 표시로만 보인다.
 * 미리 보기일 뿐이다. 실제 적용은 서버가 트리 판을 대조해 한 트랜잭션으로 한다.
 */

const ORDER = ['RENAME', 'MOVE', 'ADD', 'SPLIT', 'LINK', 'MERGE', 'CLASS', 'MATERIAL_WEEK', 'SCOPE_EXCLUDE'];

/**
 * @param tree     [{topicId, parentTopicId, title, orderIndex}] 지금 구조(활성 항목)
 * @param changes  정리안의 changes(payload 포함)
 * @param selected 고른 changeId 집합
 * @returns {{ before: Node[], after: Node[] }} Node = {key, title, children, marks[], status}
 *   status: 'same' | 'renamed' | 'moved' | 'added' | 'absorbed'
 */
export function previewStructure(tree = [], changes = [], selected = new Set()) {
  const before = build(tree.map((t) => ({ ...t, key: `t${t.topicId}` })), {});
  const nodes = new Map();
  tree.forEach((t, i) => nodes.set(`t${t.topicId}`, {
    key: `t${t.topicId}`, topicId: t.topicId, parentKey: t.parentTopicId != null ? `t${t.parentTopicId}` : null,
    title: t.title, order: t.orderIndex ?? i, status: 'same', marks: [],
  }));
  let seq = 100000;
  const tempKey = (tempId) => `n${tempId}`;
  const chosen = changes.filter((c) => selected.has(c.changeId) && c.payload)
    .sort((a, b) => ORDER.indexOf(a.op) - ORDER.indexOf(b.op));

  const addTree = (op, parentKey) => {
    const key = op.tempId ? tempKey(op.tempId) : `x${seq}`;
    seq += 1;
    nodes.set(key, { key, parentKey, title: op.title, order: seq, status: 'added', marks: [] });
    (op.children ?? []).forEach((child) => addTree(child, key));
  };

  chosen.forEach((change) => {
    const op = change.payload;
    const key = op.topicId != null ? `t${op.topicId}` : null;
    const node = key ? nodes.get(key) : null;
    switch (change.op) {
      case 'RENAME':
        if (node) { node.title = change.title ?? op.title; node.status = node.status === 'same' ? 'renamed' : node.status; }
        break;
      case 'MOVE': {
        if (!node) break;
        const parentKey = op.parentTopicId != null ? `t${op.parentTopicId}` : null;
        const siblings = [...nodes.values()].filter((n) => n.parentKey === parentKey && n.key !== key);
        node.parentKey = parentKey;
        if (op.afterTopicId == null) {
          node.order = Math.max(0, ...siblings.map((s) => s.order)) + 1;
        } else if (op.afterTopicId === 0) {
          node.order = Math.min(0, ...siblings.map((s) => s.order)) - 1;
        } else {
          const anchor = nodes.get(`t${op.afterTopicId}`);
          node.order = (anchor?.order ?? 0) + 0.5;
        }
        if (node.status === 'same') node.status = 'moved';
        break;
      }
      case 'ADD': {
        const parentKey = op.parentTopicId != null ? `t${op.parentTopicId}` : op.parentTempId ? tempKey(op.parentTempId) : null;
        addTree({ ...op, title: change.title ?? op.title }, parentKey);
        break;
      }
      case 'SPLIT':
        (op.children ?? []).forEach((child) => addTree(child, key));
        break;
      case 'MERGE': {
        const survivor = nodes.get(`t${op.survivingTopicId}`);
        (op.absorbedTopicIds ?? []).forEach((id) => {
          const absorbed = nodes.get(`t${id}`);
          if (!absorbed) return;
          absorbed.status = 'absorbed';
          absorbed.marks.push(`「${survivor?.title ?? '항목'}」에 합쳐짐`);
          // 흡수된 항목의 하위는 살아남은 항목 아래로 보이지 않는다(서버도 옮기지 않는다) — 그대로 둔다.
        });
        survivor?.marks.push('병합으로 남는 항목');
        break;
      }
      case 'CLASS':
        if (node) node.marks.push(op.week ? `실제 수업 ${op.week}주차` : '실제 수업 순서 정정');
        break;
      case 'SCOPE_EXCLUDE':
        if (node) node.marks.push(`${op.label || '이번 계획'} 범위에서 뺌`);
        break;
      default:
        break;
    }
  });
  const after = build([...nodes.values()], { keep: true });
  return { before, after };
}

function build(items, { keep = false } = {}) {
  const rows = items.map((it) => (keep ? it : {
    key: it.key, parentKey: it.parentTopicId != null ? `t${it.parentTopicId}` : null,
    title: it.title, order: it.orderIndex ?? 0, status: 'same', marks: [],
  }));
  const byParent = new Map();
  rows.forEach((r) => {
    const list = byParent.get(r.parentKey ?? null) ?? [];
    list.push(r);
    byParent.set(r.parentKey ?? null, list);
  });
  const known = new Set(rows.map((r) => r.key));
  const make = (parentKey) => (byParent.get(parentKey) ?? [])
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ key: r.key, title: r.title, status: r.status, marks: r.marks, children: make(r.key) }));
  // 부모가 목록에 없는(보이지 않는) 항목은 맨 위에 둔다.
  const orphans = rows.filter((r) => r.parentKey != null && !known.has(r.parentKey)).map((r) => r.parentKey);
  return [...make(null), ...[...new Set(orphans)].flatMap((k) => make(k))];
}

/** 바뀐 곳이 하나라도 있는가. */
export function hasStructureChange(after) {
  const walk = (nodes) => nodes.some((n) => n.status !== 'same' || n.marks.length > 0 || walk(n.children));
  return walk(after);
}
