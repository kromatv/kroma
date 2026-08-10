import { describe, expect, it } from 'vitest';
import { type FontToken, fonts, toType } from './typography';

describe('toType', () => {
  it('resolves a named family and derives the line height from the ratio', () => {
    expect(
      toType({ note: { family: 'display', weight: '700', size: 20, ratio: 1.05 } }, fonts),
    ).toEqual({
      note: { fontFamily: fonts.display, fontWeight: '700', fontSize: 20, lineHeight: 21 },
    });
  });

  it('keeps a family name no set answers to, so a theme can name a system font', () => {
    expect(
      toType(
        { note: { family: 'Courier New' as FontToken, weight: '400', size: 12, ratio: 1.5 } },
        fonts,
      ),
    ).toEqual({
      note: { fontFamily: 'Courier New', fontWeight: '400', fontSize: 12, lineHeight: 18 },
    });
  });
});
