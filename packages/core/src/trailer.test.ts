import type { Trailer } from '@kromatv/client/trailers';
import { describe, expect, it } from 'vitest';
import { playableTrailer, youtubeWatchUrl } from './trailer';

const vf: Trailer = {
  video: 'qu5n7RALVpE',
  name: 'Bande-annonce (VF)',
  language: 'fr',
  version: 'localized',
  kind: 'trailer',
  official: true,
};

describe('the trailer a title plays', () => {
  it('is the best one the server ranked', () => {
    const picked = playableTrailer({ playable: true, trailers: [vf, { ...vf, video: 'other' }] });

    expect(picked?.video).toBe('qu5n7RALVpE');
  });

  it('is none when the server cannot play trailers', () => {
    const picked = playableTrailer({ playable: false, trailers: [vf] });

    expect(picked).toBeNull();
  });

  it('is none when the title has no trailer', () => {
    const picked = playableTrailer({ playable: true, trailers: [] });

    expect(picked).toBeNull();
  });
});

describe('the trailer on YouTube', () => {
  it('opens the watch page of its video', () => {
    const url = youtubeWatchUrl('qu5n7RALVpE');

    expect(url).toBe('https://www.youtube.com/watch?v=qu5n7RALVpE');
  });
});
