import { describe, expect, it } from 'vitest';
import { radioVariants } from '#ui/components/atoms/radio';
import { colors } from '#ui/core/tokens';
import { checkboxVariants } from './checkbox';

describe('the toggle fills under a cursor', () => {
  it('hovers a checked box up the amber ladder, never back to the wash', () => {
    expect(checkboxVariants({ checked: true }).root.backgroundColor).toBe(colors.accent);
    expect(checkboxVariants({ checked: true }, { hover: true }).root.backgroundColor).toBe(
      colors.accentHover,
    );
  });

  it('keeps the white wash for the unchecked hover', () => {
    expect(checkboxVariants({ checked: false }, { hover: true }).root.backgroundColor).toBe(
      'rgba(255, 255, 255, 0.12)',
    );
  });

  it('treats the radio the same way', () => {
    expect(radioVariants({ checked: true }, { hover: true }).root.backgroundColor).toBe(
      colors.accentHover,
    );
    expect(radioVariants({ checked: false }, { hover: true }).root.backgroundColor).toBe(
      'rgba(255, 255, 255, 0.12)',
    );
  });
});
