/**
 * 이 프로젝트에서 이 자료가 맡는 역할을 고르는 select.
 *
 * enum 값과 한글 라벨은 그대로 두되, 이 컴포넌트를 쓰는 자리에는 항상 MATERIAL_TYPE_HINT를
 * 함께 붙인다 — 라벨만 보면 "이 파일이 무엇인가"로 읽히지만 실제 의미는 "이 프로젝트가
 * 이걸 무엇으로 쓰는가"이고, 같은 PDF가 프로젝트마다 다른 값을 갖는 것이 정상이기 때문이다.
 */

import { MaterialType, MATERIAL_TYPE_LABEL } from '../types/learning.js';

export default function MaterialTypeSelect({ value, onChange, disabled = false, label = '자료 역할' }) {
  return (
    <select
      className="material-type"
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {Object.values(MaterialType).map((t) => (
        <option key={t} value={t}>{MATERIAL_TYPE_LABEL[t]}</option>
      ))}
    </select>
  );
}
