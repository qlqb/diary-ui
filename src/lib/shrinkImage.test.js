import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shrinkImageToFit, ImageTooLargeError } from './shrinkImage.js';

const MAX = 100;

function fileOf(size, name = 'schedule.png', type = 'image/png') {
  return new File([new Uint8Array(size)], name, { type });
}

/** jsdom에는 캔버스 인코딩이 없다. 크기·화질에 따라 나올 JPEG 크기를 정해 흉내낸다. */
function stubCanvas(blobSize) {
  const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' };
  const canvases = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag !== 'canvas') return realCreate(tag);
    const canvas = {
      width: 0, height: 0,
      getContext: () => ctx,
      toBlob: (cb, type, quality) => cb(new Blob([new Uint8Array(blobSize(canvas, quality))], { type })),
    };
    canvases.push(canvas);
    return canvas;
  });
  return { ctx, canvases };
}

beforeEach(() => {
  globalThis.createImageBitmap = vi.fn().mockResolvedValue({ width: 4000, height: 2000, close: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.createImageBitmap;
});

describe('shrinkImageToFit', () => {
  it('상한 안이면 원본을 그대로 돌려준다', async () => {
    const file = fileOf(MAX);
    expect(await shrinkImageToFit(file, MAX)).toBe(file);
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it('넘으면 긴 변을 줄이고 흰 바탕의 JPEG로 다시 그린다', async () => {
    const { ctx, canvases } = stubCanvas(() => 50);
    const out = await shrinkImageToFit(fileOf(MAX + 1, '근무표.png'), MAX);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('근무표.jpg');
    expect(out.size).toBeLessThanOrEqual(MAX);
    expect(canvases[0].width).toBe(3072);
    expect(canvases[0].height).toBe(1536);
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('화질을 낮춰도 안 되면 크기를 더 줄여 맞춘다', async () => {
    const { canvases } = stubCanvas((canvas) => (canvas.width > 2000 ? MAX + 1 : MAX));
    const out = await shrinkImageToFit(fileOf(MAX + 1), MAX);
    expect(out.size).toBe(MAX);
    expect(canvases.length).toBe(3);
  });

  it('끝까지 못 맞추면 크기 초과로 알린다', async () => {
    stubCanvas(() => MAX + 1);
    await expect(shrinkImageToFit(fileOf(MAX + 1), MAX)).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('이미지를 열지 못해도 크기 초과로 알린다', async () => {
    globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('decode'));
    await expect(shrinkImageToFit(fileOf(MAX + 1), MAX)).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});
