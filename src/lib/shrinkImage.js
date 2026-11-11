/**
 * 일정표 가져오기 이미지를 서버 상한 안으로 줄인다.
 *
 * 캡처 도구로 자른 근무표 PNG는 화면이 크면 5MB를 쉽게 넘는다. 표 글자를 읽는 데는 그 해상도가 필요 없으니, 넘을 때만
 * 브라우저에서 JPEG로 다시 그려 보낸다. 상한 안이면 원본을 그대로 보낸다(다시 그리면 글자가 흐려질 뿐이다).
 */

/** 서버(ScheduleImageImportController.MAX_IMAGE_BYTES)와 같은 값이어야 한다. */
export const SCHEDULE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** 줄일 때 긴 변의 상한. 표 글자는 이 크기에서도 충분히 읽힌다. */
const MAX_SIDE = 3072;
/** 상한을 못 맞추면 화질을 낮추고, 그래도 안 되면 크기를 줄여 다시 시도한다. */
const QUALITIES = [0.9, 0.8, 0.7];
const SCALE_STEP = 0.75;
const MAX_ROUNDS = 4;

/** 줄이지 못했다(디코딩 실패·캔버스 미지원·끝까지 상한 초과). 화면은 크기 초과 문구를 보여 준다. */
export class ImageTooLargeError extends Error {
  constructor() {
    super('이미지가 5MB를 넘어요. 크기를 줄여서 다시 올려 주세요');
    this.name = 'ImageTooLargeError';
  }
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function jpegName(name) {
  const base = (name || 'schedule').replace(/\.[^.]*$/, '');
  return `${base}.jpg`;
}

/**
 * @param {File} file 사용자가 고르거나 붙여넣은 이미지
 * @param {number} [maxBytes]
 * @returns {Promise<File>} 상한 안이면 원본, 넘으면 줄인 JPEG
 * @throws {ImageTooLargeError} 줄이지 못했을 때
 */
export async function shrinkImageToFit(file, maxBytes = SCHEDULE_IMAGE_MAX_BYTES) {
  if (!file || file.size <= maxBytes) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageTooLargeError();
  }
  try {
    let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImageTooLargeError();
      // JPEG에는 투명이 없다 — 투명 PNG가 검게 나오지 않게 흰 바탕을 먼저 깐다.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        const blob = await toBlob(canvas, quality);
        if (blob && blob.size <= maxBytes) {
          return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
        }
      }
      scale *= SCALE_STEP;
    }
    throw new ImageTooLargeError();
  } finally {
    bitmap.close?.();
  }
}
