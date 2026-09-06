import { StyleSheet } from 'react-native';
import { describe, expect, it } from 'vitest';
import { staticStyle } from './atomic/register';
import { isStaticStyle } from './atomic/static-style';
import { sv } from './recipe';

describe('sv over static layers', () => {
  const chip = sv({
    base: staticStyle(
      { borderRadius: 999 },
      { hover: staticStyle({ backgroundColor: 'hover' }) },
    ) as never,
    variants: {
      tone: {
        neutral: staticStyle({ backgroundColor: 'neutral' }) as never,
        accent: staticStyle({ backgroundColor: 'accent' }) as never,
      },
    },
    defaults: { tone: 'neutral' },
  });

  it('merges the cascade into a static style the renderer registers as such', () => {
    const root = chip({ tone: 'accent' }).root;

    expect(isStaticStyle(root)).toBe(true);
    expect({ ...root }).toEqual({ borderRadius: 999, backgroundColor: 'accent' });
    expect(StyleSheet.flatten(root)).toEqual({ borderRadius: 999, backgroundColor: 'accent' });
  });

  it('paints a state from the static coat', () => {
    const rest = chip({}, { hover: false });
    const hovered = chip({}, { hover: true });

    expect(rest.root).toMatchObject({ backgroundColor: 'neutral' });
    expect(hovered.root).toMatchObject({ backgroundColor: 'hover' });
    expect(chip({}, { hover: true }).root).toBe(hovered.root);
  });
});
