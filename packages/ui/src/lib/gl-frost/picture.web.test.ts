// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPicture } from './picture.web';

const asked: string[] = [];

function stubImages(fails: (src: string) => boolean) {
  class FakeImage {
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      asked.push(value);
      queueMicrotask(() => (fails(value) ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

afterEach(() => {
  asked.length = 0;
  vi.unstubAllGlobals();
});

describe('loadPicture', () => {
  it('asks again on a URL the cache has not seen when the art first refuses to load', async () => {
    stubImages((src) => !src.includes('frost=1'));

    const picture = await loadPicture('http://tv.local/api/art/1?w=1280', undefined, '50% 50%', 12);

    expect(picture).not.toBeNull();
    expect(asked).toEqual([
      'http://tv.local/api/art/1?w=1280',
      'http://tv.local/api/art/1?w=1280&frost=1',
    ]);
  });

  it('loads the art once when it arrives the first time', async () => {
    stubImages(() => false);

    await loadPicture('http://tv.local/api/art/1', undefined, '50% 50%', 12);

    expect(asked).toEqual(['http://tv.local/api/art/1']);
  });

  it('gives up when the art will not load at all', async () => {
    stubImages(() => true);

    expect(await loadPicture('http://tv.local/api/art/1', undefined, '50% 50%', 12)).toBeNull();
  });
});
