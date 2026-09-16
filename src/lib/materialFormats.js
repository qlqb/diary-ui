/**
 * 자료로 올릴 수 있는 파일 형식. 서버(MaterialFileFormat)와 같은 목록을 들고 있어야 한다.
 *
 * zip은 자료 하나로 저장되고 서버가 안의 문서(PDF·PPTX·HWP·IPYNB·텍스트·소스 파일)를 읽는다.
 * hwp는 HWP 5.0만 읽는다 — HWPX는 서버가 받지 않으므로 여기서도 거른다.
 */
export const MATERIAL_EXTENSIONS = ['pdf', 'pptx', 'hwp', 'ipynb', 'zip'];

/** input의 accept 값. 드래그앤드롭에는 적용되지 않으니 isAllowedMaterialFile로 한 번 더 거른다. */
export const MATERIAL_ACCEPT = MATERIAL_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/** 안내 문구에 쓰는 형식 나열. */
export const MATERIAL_FORMATS_LABEL = 'PDF·PPTX·HWP·IPYNB·ZIP';

export function materialExtension(filename) {
  const name = String(filename ?? '');
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isAllowedMaterialFile(filename) {
  return MATERIAL_EXTENSIONS.includes(materialExtension(filename));
}

const KIND_BY_CONTENT_TYPE = [
  ['pdf', 'PDF'],
  ['presentation', 'PPTX'],
  ['hwp', 'HWP'],
  ['ipynb', 'IPYNB'],
  ['zip', 'ZIP'],
];

/** 목록에 보이는 형식 이름. 파일명 확장자를 먼저 보고, 없으면 content type으로 짐작한다. */
export function materialFileKind(filename, contentType) {
  const ext = materialExtension(filename);
  if (MATERIAL_EXTENSIONS.includes(ext)) return ext.toUpperCase();
  const type = String(contentType ?? '').toLowerCase();
  const match = KIND_BY_CONTENT_TYPE.find(([needle]) => type.includes(needle));
  return match ? match[1] : 'PDF';
}
