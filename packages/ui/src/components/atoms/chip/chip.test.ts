import { describe, expect, it } from 'vitest';
import { chipVariants } from './chip';

const VARIANTS = ['solid', 'subtle', 'surface'] as const;
const SIZES = ['sm', 'tv'] as const;

describe('chip design', () => {
  it('gives every variant an idle fill of its own', () => {
    expect(chipVariants({ variant: 'solid' }).root.backgroundColor).toBe('var(--kroma-tint-7)');
    expect(chipVariants({ variant: 'subtle' }).root.backgroundColor).toBe('var(--kroma-tint-8)');
    expect(chipVariants({ variant: 'surface' }).root.backgroundColor).toBe(
      'var(--kroma-surface-2)',
    );
  });

  it("paints an active chip's dot in ink, whatever colour the caller asked for", () => {
    // The status hues ARE the accent and its neighbours, so a dot that kept
    // its own colour would vanish into the active fill. Every variant flips.
    for (const variant of VARIANTS) {
      expect(chipVariants({ variant, active: true }).dot.backgroundColor).toBe(
        'var(--kroma-accent-ink)',
      );
      expect(chipVariants({ variant }).dot.backgroundColor).toBeUndefined();
    }
  });

  it('keeps the count in step with the label it trails', () => {
    for (const variant of VARIANTS) {
      const idle = chipVariants({ variant });
      expect(idle.count.color).toBe(idle.label.color);
      const on = chipVariants({ variant, active: true });
      expect(on.count.color).toBe(on.label.color);
      expect(on.count.color).toBe('var(--kroma-accent-ink)');
    }
    for (const size of SIZES) {
      const at = chipVariants({ size });
      expect(at.count.fontSize).toBe(at.label.fontSize);
    }
  });

  it('borders only the solid variant', () => {
    expect(chipVariants({ variant: 'solid' }).root.borderWidth).toBe(1);
    expect(chipVariants({ variant: 'subtle' }).root.borderWidth).toBe(0);
    expect(chipVariants({ variant: 'surface' }).root.borderWidth).toBe(0);
  });

  it('lifts each variant to its own wash under a cursor', () => {
    const hovered = (variant: (typeof VARIANTS)[number]) =>
      chipVariants({ variant }, { hover: true }).root.backgroundColor;
    expect(hovered('solid')).toBe('var(--kroma-tint-13)');
    expect(hovered('subtle')).toBe('var(--kroma-tint-14)');
    expect(hovered('surface')).toBe('var(--kroma-surface-3)');
  });

  describe('active', () => {
    it('takes the accent over every variant, ink and all', () => {
      for (const variant of VARIANTS) {
        const s = chipVariants({ variant, active: true });
        expect(s.root.backgroundColor).toBe('var(--kroma-accent)');
        expect(s.label.color).toBe('var(--kroma-accent-ink)');
        expect(s.icon.color).toBe('var(--kroma-accent-ink)');
      }
    });

    it('hovers UP the amber ladder rather than back to a white wash', () => {
      for (const variant of VARIANTS) {
        expect(chipVariants({ variant, active: true }, { hover: true }).root.backgroundColor).toBe(
          'var(--kroma-accent-hover)',
        );
      }
    });

    it('leaves the idle wash alone when off, needing no compound rule', () => {
      // `active` is declared after `variant`, so an empty `false` option cannot
      // stomp the fill each variant chose. Before, the order was reversed and a
      // compound had to put the accent back.
      expect(chipVariants({ variant: 'surface', active: false }).root.backgroundColor).toBe(
        'var(--kroma-surface-2)',
      );
    });

    it('accepts the boolean rather than its string spelling', () => {
      expect(chipVariants({ active: true })).toBe(chipVariants({ active: 'true' }));
    });
  });

  describe('size', () => {
    it('scales the label and the glyph together', () => {
      expect(chipVariants({ size: 'sm' }).label.fontSize).toBe(13);
      expect(chipVariants({ size: 'sm' }).icon.size).toBe(15);
      expect(chipVariants({ size: 'tv' }).label.fontSize).toBe(18);
      expect(chipVariants({ size: 'tv' }).icon.size).toBe(17);
    });

    it('pads the 10-foot chip out, keeping the pill radius', () => {
      expect(chipVariants({ size: 'tv' }).root).toMatchObject({
        paddingTop: 10,
        paddingLeft: 22,
        borderRadius: 999,
      });
    });
  });

  it('declares no press, focus or disabled state, so those cost nothing', () => {
    // Focus is the ring alone on a chip. States outside the recipe's mask must
    // not split its cache.
    const rest = chipVariants();
    expect(chipVariants({}, { press: true })).toBe(rest);
    expect(chipVariants({}, { focus: true })).toBe(rest);
    expect(chipVariants({}, { disabled: true })).toBe(rest);
  });

  it('resolves every combination to a frozen, identity-stable object', () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        const s = chipVariants({ variant, size, active: true });
        expect(s).toBe(chipVariants({ variant, size, active: true }));
        expect(Object.isFrozen(s.root)).toBe(true);
      }
    }
  });
});
