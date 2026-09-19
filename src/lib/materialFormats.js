/**
 * 자료로 올릴 수 있는 파일 형식. 서버(MaterialFileFormat)와 같은 목록을 들고 있어야 한다.
 *
 * ZIP은 이 목록에 없다 — 압축은 자료가 아니라 "여러 자료를 가져오는 통로"라서, 고르면 업로드 대신
 * 가져오기 화면으로 간다(서버도 /materials가 아니라 /materials/zip-imports가 받는다).
 * 파일 선택창에서는 함께 고를 수 있어야 하므로 accept에는 .zip이 들어간다.
 *
 * hwp는 HWP 5.0만 읽는다. hwpx는 별도 형식이라 둘 다 적는다.
 *
 * sh는 실행하지 않는다 — 실습 자료에 딸려 오는 스크립트를 "무엇을 하는 파일인지" 읽을 텍스트로만 받는다.
 */
export const MATERIAL_EXTENSIONS = ['pdf', 'pptx', 'hwp', 'hwpx', 'ipynb', 'sh'];

export const ARCHIVE_EXTENSION = 'zip';

/** input의 accept 값. 드래그앤드롭에는 적용되지 않으니 아래 판별 함수로 한 번 더 거른다. */
export const MATERIAL_ACCEPT = [...MATERIAL_EXTENSIONS, ARCHIVE_EXTENSION]
  .map((ext) => `.${ext}`)
  .join(',');

/** 안내 문구에 쓰는 형식 나열. */
export const MATERIAL_FORMATS_LABEL = 'PDF·PPTX·HWP·HWPX·IPYNB·SH';

/** 셸 스크립트를 올려도 되는지 망설이는 사람에게 하는 말. 업로드 안내 옆에 늘 붙는다. */
export const SHELL_SCRIPT_HINT = '셸 스크립트(.sh)는 실행하지 않고 텍스트 자료로만 읽어요';
export const UPLOAD_FORMATS_LABEL = `${MATERIAL_FORMATS_LABEL} · ZIP(안에 든 파일을 골라서)`;

export function materialExtension(filename) {
  const name = String(filename ?? '');
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** 그대로 자료가 되는 파일인가. */
export function isAllowedMaterialFile(filename) {
  return MATERIAL_EXTENSIONS.includes(materialExtension(filename));
}

/** 압축 파일인가. 업로드가 아니라 가져오기로 가는 갈림길이다. */
export function isArchiveFile(filename) {
  return materialExtension(filename) === ARCHIVE_EXTENSION;
}

/** 올릴 수 있는 파일인가(자료 또는 압축). */
export function isAcceptedFile(filename) {
  return isAllowedMaterialFile(filename) || isArchiveFile(filename);
}

const KIND_BY_CONTENT_TYPE = [
  ['ipynb', 'IPYNB'],
  ['x-sh', 'SH'],
  ['shellscript', 'SH'],
  ['hwp+zip', 'HWPX'],
  ['hwp', 'HWP'],
  ['presentation', 'PPTX'],
  ['pdf', 'PDF'],
  ['zip', 'ZIP'],
];

/** 목록에 보이는 형식 이름. 파일명 확장자를 먼저 보고, 없으면 content type으로 짐작한다. */
export function materialFileKind(filename, contentType) {
  const ext = materialExtension(filename);
  if (MATERIAL_EXTENSIONS.includes(ext) || ext === ARCHIVE_EXTENSION) return ext.toUpperCase();
  const type = String(contentType ?? '').toLowerCase();
  const match = KIND_BY_CONTENT_TYPE.find(([needle]) => type.includes(needle));
  return match ? match[1] : 'PDF';
}
