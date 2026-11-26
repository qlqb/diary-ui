import { materialStoreAPI } from '../api/api.js';

/** 내려받기용 임시 주소를 언제 놓을지. 너무 빨리 놓으면 저장이 시작되기 전에 끊길 수 있다. */
const REVOKE_DELAY_MS = 60_000;

/**
 * 형식과 상관없이 파일을 내려받는다(PDF도 새 탭으로 열지 않고 저장). 프로젝트 자료 줄의 ⋯ 메뉴가 쓴다.
 * 실패하면 예외를 그대로 던진다 — 부르는 쪽이 자기 자리에서 알린다.
 */
export async function downloadMaterialFile(materialId, filename) {
  const blob = await materialStoreAPI.file(materialId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || '자료';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
