// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageSize } from './image-size';

const page = vi.hoisted(() => ({ hasDocument: true }));

vi.mock('./dom', async (original) => {
  const real = await original<typeof import('./dom')>();
  return { ...real, webDocument: () => (page.hasDocument ? real.webDocument() : null) };
});

function arriving(outcome: 'load' | 'error') {
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(360);
  vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function arrive(
    this: HTMLImageElement,
  ) {
    queueMicrotask(() => {
      if (outcome === 'load') {
        this.onload?.(new Event('load'));
      } else {
        this.onerror?.(new Event('error'));
      }
    });
  });
}

beforeEach(() => {
  page.hasDocument = true;
});

afterEach(() => vi.restoreAllMocks());

describe('imageSize', () => {
  it('resolves the size the picture decoded at', async () => {
    arriving('load');

    expect(await imageSize('/api/images/a.webp')).toEqual({ width: 640, height: 360 });
  });

  it('resolves null for a picture that does not load', async () => {
    arriving('error');

    expect(await imageSize('/api/images/b.webp')).toBeNull();
  });

  it('resolves null with no document to load it in', async () => {
    page.hasDocument = false;

    expect(await imageSize('/api/images/c.webp')).toBeNull();
  });
});
