import { describe, expect, it } from 'vitest';
import { mirrorsInRtl } from './mirrored';

describe('mirrorsInRtl', () => {
  it.each([
    'chevron-left',
    'chevron-right',
    'chevrons-right',
    'arrow-left',
    'arrow-narrow-right',
    'arrow-back-up',
    'arrow-forward-up',
    'corner-down-left',
    'external-link',
    'logout',
    'login-2',
    'send',
    'backspace',
  ])('turns %s round, since it points a way along the line', (name) => {
    expect(mirrorsInRtl(name)).toBe(true);
  });

  it.each([
    'player-play',
    'player-play-filled',
    'player-skip-forward',
    'player-skip-back',
    'player-track-next-filled',
    'player-track-prev',
    'rewind-forward-10',
    'rewind-backward-10',
  ])('keeps the media glyph %s as it is', (name) => {
    expect(mirrorsInRtl(name)).toBe(false);
  });

  it.each(['arrow-up', 'chevron-down', 'check', 'clock', 'search', 'arrows-exchange', 'leftover'])(
    'keeps %s as it is, since it points no way along the line',
    (name) => {
      expect(mirrorsInRtl(name)).toBe(false);
    },
  );
});
