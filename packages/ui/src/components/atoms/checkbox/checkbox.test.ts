import { describe, expect, it } from 'vitest';
import { radioVariants } from '#ui/components/atoms/radio';
import { checkboxVariants } from './checkbox';

describe('the toggle fills under a cursor', () => {
  it('hovers a checked box up the amber ladder, never back to the wash', () => {
    expect(checkboxVariants({ checked: true }).root.backgroundColor).toBe('var(--kroma-accent)');
    expect(checkboxVariants({ checked: true }, { hover: true }).root.backgroundColor).toBe(
      'var(--kroma-accent-hover)',
    );
  });

  it('keeps the white wash for the unchecked hover', () => {
    expect(checkboxVariants({ checked: false }, { hover: true }).root.backgroundColor).toBe(
      'var(--kroma-tint-12)',
    );
  });

  it('treats the radio the same way', () => {
    expect(radioVariants({ checked: true }, { hover: true }).root.backgroundColor).toBe(
      'var(--kroma-accent-hover)',
    );
    expect(radioVariants({ checked: false }, { hover: true }).root.backgroundColor).toBe(
      'var(--kroma-tint-12)',
    );
  });
});
