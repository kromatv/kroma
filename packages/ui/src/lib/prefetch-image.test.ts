// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefetchImage } from './prefetch-image';

const proto = HTMLImageElement.prototype as { decode?: () => Promise<void> };

afterEach(() => {
  delete proto.decode;
  vi.restoreAllMocks();
});

function lastImage(): HTMLImageElement {
  const created: HTMLImageElement[] = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = create(tag);
    if (el instanceof HTMLImageElement) created.push(el);
    return el;
  });
  return new Proxy({} as HTMLImageElement, {
    get: (_, key) => (created.at(-1) as unknown as Record<PropertyKey, unknown>)[key],
  });
}

describe('prefetchImage', () => {
  it('resolves true once the image has decoded', async () => {
    proto.decode = vi.fn(() => Promise.resolve());

    expect(await prefetchImage('/api/images/a.webp')).toBe(true);
  });

  it('resolves false when the image cannot decode', async () => {
    proto.decode = () => Promise.reject(new Error('broken'));

    expect(await prefetchImage('/api/images/b.webp')).toBe(false);
  });

  it('falls back to the load event where decode is missing', async () => {
    const img = lastImage();

    const ready = prefetchImage('/api/images/c.webp');
    img.onload?.(new Event('load'));

    expect(await ready).toBe(true);
    expect(img.src).toContain('/api/images/c.webp');
    expect(img.decoding).toBe('async');
  });

  it('falls back to the error event where decode is missing', async () => {
    const img = lastImage();

    const ready = prefetchImage('/api/images/d.webp');
    img.onerror?.(new Event('error'));

    expect(await ready).toBe(false);
  });
});
