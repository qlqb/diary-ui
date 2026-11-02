/**
 * 교재 목차 항목(평평한 목록, level로 깊이)을 트리로 묶는다. 부모 = 앞쪽에서 가장 가까운, 깊이가 더 얕은 항목.
 * 깊이 단계를 자르지 않는다 — 화면이 접어서 보여 준다.
 *
 * @param {{level:number, number?:string, title:string, page?:number, unit:number}[]} entries
 * @returns {{key:string, entry:object, children:object[]}[]}
 */
export function tocTree(entries) {
  const roots = [];
  const stack = [];
  (entries ?? []).forEach((entry, i) => {
    const node = { key: `${entry.unit ?? 0}-${i}`, entry, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].entry.level >= entry.level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  return roots;
}

/** 트리 안 항목 수(자기 자신 제외). */
export function countBelow(node) {
  return node.children.reduce((n, child) => n + 1 + countBelow(child), 0);
}
