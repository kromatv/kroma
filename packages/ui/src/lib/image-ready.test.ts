import { beforeEach, describe, expect, it } from 'vitest';
import { isImageReady, markImageReady, resetImageReady } from './image-ready';

describe('image ready set', () => {
  beforeEach(() => resetImageReady());

  it('does not know an image nothing has loaded', () => {
    expect(isImageReady('/a.webp')).toBe(false);
  });

  it('knows an image once it is marked ready', () => {
    markImageReady('/a.webp');

    expect(isImageReady('/a.webp')).toBe(true);
  });

  it('forgets the least recently marked image past its bound', () => {
    markImageReady('/first.webp');
    markImageReady('/second.webp');
    markImageReady('/first.webp');

    for (let i = 0; i < 799; i += 1) markImageReady(`/${i}.webp`);

    expect(isImageReady('/first.webp')).toBe(true);
    expect(isImageReady('/second.webp')).toBe(false);
  });
});
