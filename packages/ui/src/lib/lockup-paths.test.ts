import { describe, expect, it } from 'vitest';
import { lockupSvg } from './lockup-paths';
import { KROMA_WHEEL_COLORS } from './wheel-paths';

describe('lockupSvg', () => {
  it('draws both letter groups in the ink and every wheel segment in its own colour', () => {
    const svg = lockupSvg('#F4F3F0');

    const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);

    expect(fills).toEqual(['#F4F3F0', ...KROMA_WHEEL_COLORS, '#F4F3F0']);
  });

  it('spans the lockup from the K to the end of the A', () => {
    const svg = lockupSvg('#000');

    expect(svg).toContain('viewBox="0 0 457.4 100"');
  });
});
