import { describe, expect, it } from 'vitest';
import { bandOffset } from './scroll-offsets';

describe('bandOffset', () => {
  const band = { size: 100, margin: 10, viewport: 450, content: 1040 };

  it('moves a row in the middle just into view, as nearest does', () => {
    expect(bandOffset({ top: 520, current: 0, ...band })).toBe(180);
  });

  it('carries the last row on to the end, past the padding under it', () => {
    expect(bandOffset({ top: 900, current: 400, ...band })).toBe(590);
  });

  it('carries the first row on to the start, past a heading above it', () => {
    expect(bandOffset({ top: 40, current: 200, ...band })).toBe(0);
  });

  it('never carries a row on to an end where it would be cut', () => {
    const tall = { ...band, size: 400 };

    expect(bandOffset({ top: 300, current: 0, ...tall })).toBe(260);
  });

  it('leaves a row that is already whole where it is', () => {
    expect(bandOffset({ top: 300, current: 200, ...band })).toBe(200);
  });
});
