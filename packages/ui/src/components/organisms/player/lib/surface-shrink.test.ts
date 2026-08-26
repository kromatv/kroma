import { describe, expect, it } from 'vitest';
import { surfaceShrink } from './surface-shrink';

describe('surfaceShrink', () => {
  it('scales the surfaces that draw inside the view hierarchy', () => {
    expect(surfaceShrink('video')).toBe('transform');
    expect(surfaceShrink('vlc')).toBe('transform');
  });

  it('moves a plane behind the page with setPlaneRect, and only those', () => {
    expect(surfaceShrink('avplay')).toBe('plane');
    expect(surfaceShrink('mpv')).toBe('plane');
  });
});
