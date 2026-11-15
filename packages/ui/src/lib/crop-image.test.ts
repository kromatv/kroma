// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CROP_IDENTITY } from './crop-geometry';
import { cropImage } from './crop-image';

const page = vi.hoisted(() => ({ hasDocument: true }));

vi.mock('./dom', async (original) => {
  const real = await original<typeof import('./dom')>();
  return { ...real, webDocument: () => (page.hasDocument ? real.webDocument() : null) };
});

const PHOTO = 'blob:http://localhost/photo';

function fakeContext() {
  return {
    imageSmoothingQuality: 'low',
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  };
}

type Outcome = 'load' | 'error';

function images(outcome: Outcome, natural = { width: 400, height: 200 }): HTMLImageElement[] {
  const made: HTMLImageElement[] = [];
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(natural.width);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(natural.height);
  vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function arrive(
    this: HTMLImageElement,
  ) {
    made.push(this);
    queueMicrotask(() => {
      if (outcome === 'load') this.onload?.(new Event('load'));
      else this.onerror?.(new Event('error'));
    });
  });
  return made;
}

function canvas(context: ReturnType<typeof fakeContext> | null = fakeContext()) {
  const made: HTMLCanvasElement[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function draw(
    this: HTMLCanvasElement,
  ) {
    made.push(this);
    return context as unknown as CanvasRenderingContext2D;
  });
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((done, type) => done(new Blob(['pixels'], { type })));
  return { context, toBlob, made };
}

const crop = { src: PHOTO, transform: CROP_IDENTITY, aspect: 1 };

beforeEach(() => {
  page.hasDocument = true;
});

afterEach(() => vi.restoreAllMocks());

describe('cropImage', () => {
  it('draws the picture centred at its own resolution and encodes it as WebP', async () => {
    const [made] = [images('load')];
    const { context, toBlob, made: canvases } = canvas();

    const blob = await cropImage(crop);

    expect(blob?.type).toBe('image/webp');
    expect(canvases[0]?.width).toBe(200);
    expect(canvases[0]?.height).toBe(200);
    expect(context?.imageSmoothingQuality).toBe('high');
    expect(context?.translate).toHaveBeenCalledWith(100, 100);
    expect(context?.rotate).toHaveBeenCalledWith(0);
    expect(context?.scale).toHaveBeenCalledWith(1, 1);
    expect(context?.drawImage).toHaveBeenCalledWith(made[0], -200, -100, 400, 200);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.9);
  });

  it('draws the same crop at the size, turn and offset it is asked for', async () => {
    images('load');
    const { context, made: canvases } = canvas();

    await cropImage(
      { ...crop, transform: { zoom: 2, x: 0.25, y: -0.5, rotation: 90 } },
      { width: 512, height: 512 },
    );

    expect(canvases[0]?.width).toBe(512);
    expect(context?.translate).toHaveBeenCalledWith(384, 0);
    expect(context?.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(context?.scale).toHaveBeenCalledWith(5.12, 5.12);
  });

  it('encodes in the type and at the quality it is given', async () => {
    images('load');
    const { toBlob } = canvas();

    const blob = await cropImage(crop, { type: 'image/jpeg', quality: 0.5 });

    expect(blob?.type).toBe('image/jpeg');
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.5);
  });

  it('asks another origin for a picture it may read back, and leaves a local one alone', async () => {
    const made = images('load');
    canvas();

    await cropImage({ ...crop, src: 'https://kroma.test/a.jpg' });
    await cropImage(crop);

    expect(made[0]?.crossOrigin).toBe('anonymous');
    expect(made[1]?.crossOrigin).toBeNull();
  });

  it('answers null for a picture that does not load', async () => {
    images('error');
    const { toBlob } = canvas();

    expect(await cropImage(crop)).toBeNull();
    expect(toBlob).not.toHaveBeenCalled();
  });

  it('answers null for a picture with no pixels', async () => {
    images('load', { width: 0, height: 0 });
    canvas();

    expect(await cropImage(crop)).toBeNull();
  });

  it('answers null where the canvas has no 2D context', async () => {
    images('load');
    const { toBlob } = canvas(null);

    expect(await cropImage(crop)).toBeNull();
    expect(toBlob).not.toHaveBeenCalled();
  });

  it('answers null when the canvas refuses to be read back', async () => {
    images('load');
    const { toBlob } = canvas();
    toBlob.mockImplementation(() => {
      throw new DOMException('tainted', 'SecurityError');
    });

    expect(await cropImage(crop)).toBeNull();
  });

  it('answers null with no document to draw in', async () => {
    page.hasDocument = false;

    expect(await cropImage(crop)).toBeNull();
  });
});
