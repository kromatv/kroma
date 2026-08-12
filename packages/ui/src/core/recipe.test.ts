import { describe, expect, it } from 'vitest';
import { type StyleDecl, sv, svFor } from '#ui/core';

describe('sv', () => {
  const card = sv({
    slots: {
      root: { borderRadius: 10 },
      label: { fontWeight: '700' },
    },
    variants: {
      size: {
        md: { root: { padding: 20 }, label: { fontSize: 16 } },
        sm: { root: { padding: 12 }, label: { fontSize: 13 } },
      },
      tone: {
        plain: {},
        loud: { label: { color: '#F4B642' } },
      },
    },
    compound: [{ when: { size: 'sm', tone: 'loud' }, style: { root: { borderWidth: 1 } } }],
    defaults: { size: 'md', tone: 'plain' },
  });

  it('merges every slot, applying only what an option declares for it', () => {
    const s = card({ size: 'sm', tone: 'loud' });
    expect(s.root).toEqual({ borderRadius: 10, padding: 12, borderWidth: 1 });
    expect(s.label).toEqual({ fontWeight: '700', fontSize: 13, color: '#F4B642' });
  });

  it('applies the defaults when the caller passes nothing', () => {
    expect(card()).toEqual({
      root: { borderRadius: 10, padding: 20 },
      label: { fontWeight: '700', fontSize: 16 },
    });
  });

  it('overrides only the variant the caller names', () => {
    expect(card({ size: 'sm' }).label).toEqual({ fontWeight: '700', fontSize: 13 });
  });

  it('matches a compound rule against a value that came from the defaults', () => {
    // `size` defaults to md, so the rule requiring sm must not fire.
    expect(card({ tone: 'loud' }).root).not.toHaveProperty('borderWidth');
  });

  it('resolves each slot last-wins per property, not by stacking layers', () => {
    const one = sv({
      slots: { root: { padding: 4 } },
      variants: { big: { true: { root: { padding: 20 } }, false: {} } },
      defaults: { big: 'false' },
    });
    expect(one({ big: 'true' }).root).toEqual({ padding: 20 });
  });

  it('works with no variants at all', () => {
    expect(sv({ slots: { root: { flex: 1 } } })().root).toEqual({ flex: 1 });
    expect(sv({ slots: {} })()).toEqual({});
  });

  it('leaves out a group nobody picked and nothing defaulted', () => {
    const r = sv({ base: { flex: 1 }, variants: { tone: { loud: { padding: 8 } } } });
    expect(r().root).toEqual({ flex: 1 });
  });

  it('returns the SAME object for the same combination, so a re-render is identity-equal', () => {
    expect(card({ size: 'sm' })).toBe(card({ size: 'sm' }));
    expect(card()).toBe(card({ size: 'md', tone: 'plain' }));
    expect(card({ size: 'sm' })).not.toBe(card());
  });

  it('freezes what it hands back, so a caller cannot poison the cache', () => {
    expect(Object.isFrozen(card().root)).toBe(true);
    expect(Object.isFrozen(card())).toBe(true);
  });

  it('carries the introspection surface the workbench reads', () => {
    expect(card.options).toEqual({ size: ['md', 'sm'], tone: ['plain', 'loud'] });
    expect(card.defaults).toEqual({ size: 'md', tone: 'plain' });
    expect(card.slots).toEqual(['root', 'label']);
  });
});

describe('sv shorthands', () => {
  it('resolves the <Box> vocabulary into plain React Native longhands', () => {
    const pill = sv({
      slots: { root: { row: true, center: true, px: 18, radius: 'pill', bg: 'surface2' } },
    });
    expect(pill().root).toEqual({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 18,
      paddingRight: 18,
      borderRadius: 999,
      backgroundColor: 'var(--kroma-surface-2)',
    });
  });

  it('passes any key the shorthands do not own straight through', () => {
    const text = sv({ slots: { label: { fontSize: 15, color: '#F4F3F0', letterSpacing: 0.2 } } });
    expect(text().label).toEqual({ fontSize: 15, color: '#F4F3F0', letterSpacing: 0.2 });
  });

  it('lets a longhand in the same object beat the shorthand it stands for', () => {
    const one = sv({ slots: { root: { bg: 'accent', backgroundColor: '#123456' } } });
    expect(one().root).toEqual({ backgroundColor: '#123456' });
  });

  it('resolves a token name through the palette and leaves a raw colour alone', () => {
    const one = sv({ slots: { a: { bg: 'accent' }, b: { bg: 'rgba(1, 2, 3, 0.5)' } } });
    expect(one().a).toEqual({ backgroundColor: 'var(--kroma-accent)' });
    expect(one().b).toEqual({ backgroundColor: 'rgba(1, 2, 3, 0.5)' });
  });
});

describe('sv states', () => {
  // A slot that feeds PROPS rather than styles: <Icon> has no `style` at all,
  // its colour is a token name. Naming the shape is what types it.
  interface Glyph {
    color: string;
    size: number;
  }

  const iconButton = svFor<{ root: StyleDecl; icon: Glyph }>()({
    slots: {
      root: { center: true, radius: 'pill', _disabled: { opacity: 0.5 } },
      icon: { color: 'text', size: 24 },
    },
    variants: {
      variant: {
        glass: {
          root: {
            bg: 'rgba(255, 255, 255, 0.12)',
            _hover: { bg: 'rgba(255, 255, 255, 0.18)' },
            _press: { bg: 'rgba(255, 255, 255, 0.22)' },
          },
        },
        primary: {
          root: { bg: 'accent', _hover: { bg: 'accentHover' } },
          icon: { color: 'accentInk' },
        },
      },
      active: {
        true: { root: { _hover: { bg: 'accentSoft' } }, icon: { color: 'accent' } },
        false: {},
      },
    },
    defaults: { variant: 'glass', active: 'false' },
  });

  it('paints nothing extra at rest', () => {
    expect(iconButton().root).toEqual({
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
    });
  });

  it('layers the state a variant declares for itself', () => {
    expect(iconButton({ variant: 'glass' }, { hover: true }).root).toMatchObject({
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
    });
    expect(iconButton({ variant: 'primary' }, { hover: true }).root).toMatchObject({
      backgroundColor: 'var(--kroma-accent-hover)',
    });
  });

  it('applies press over hover, in the fixed cascade order', () => {
    expect(iconButton({ variant: 'glass' }, { hover: true, press: true }).root).toMatchObject({
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
    });
  });

  it('applies a base state layer as well as the variant ones', () => {
    expect(iconButton({}, { disabled: true }).root).toMatchObject({ opacity: 0.5 });
  });

  it('lets a later variant group raise the state an earlier one set', () => {
    // `active` is declared after `variant`, so its `_hover` wins.
    expect(iconButton({ variant: 'glass', active: 'true' }, { hover: true }).root).toMatchObject({
      backgroundColor: 'var(--kroma-accent-soft)',
    });
  });

  it('leaves a state unapplied when its flag is off', () => {
    expect(iconButton({ variant: 'glass' }, { hover: false }).root).toMatchObject({
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
    });
  });

  it('resolves colours in a props slot, not only in a painted one', () => {
    expect(iconButton().icon).toEqual({ color: 'var(--kroma-text)', size: 24 });
    expect(iconButton({ variant: 'primary' }).icon).toEqual({
      color: 'var(--kroma-accent-ink)',
      size: 24,
    });
    expect(iconButton({ active: 'true' }).icon).toEqual({ color: 'var(--kroma-accent)', size: 24 });
  });

  it('keeps the identity guarantee across the state axis', () => {
    const hovered = iconButton({ variant: 'glass' }, { hover: true });
    expect(hovered).toBe(iconButton({ variant: 'glass' }, { hover: true }));
    expect(hovered).not.toBe(iconButton({ variant: 'glass' }));
    // The same combination reached two ways is one cache entry.
    expect(iconButton()).toBe(iconButton({ variant: 'glass', active: 'false' }, {}));
  });
});

describe('sv flat form', () => {
  // The single-slot spelling: `base` plus options that are just the style they
  // paint, which is as close to `bg-white/12 hover:bg-white/18` as a typed
  // object gets.
  const pill = sv({
    base: { row: true, center: true, radius: 'pill', bg: 'white/10', _disabled: { opacity: 0.5 } },
    variants: {
      tone: {
        quiet: { bg: 'white/10', _hover: { bg: 'white/18' } },
        loud: { bg: 'accent', _hover: { bg: 'accentHover' } },
      },
      size: { sm: { px: 12 }, lg: { px: 20 } },
    },
    defaults: { tone: 'quiet', size: 'sm' },
  });

  it('resolves under `root`, so nothing downstream knows which form was used', () => {
    expect(pill().root).toMatchObject({
      flexDirection: 'row',
      borderRadius: 999,
      paddingLeft: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    });
  });

  it('layers flat options and their states', () => {
    expect(pill({ tone: 'loud' }, { hover: true }).root).toMatchObject({
      backgroundColor: 'var(--kroma-accent-hover)',
    });
    expect(pill({ tone: 'quiet' }, { hover: true }).root).toMatchObject({
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
    });
  });

  it('applies a base state layer', () => {
    expect(pill({}, { disabled: true }).root).toMatchObject({ opacity: 0.5 });
  });

  it('keeps the identity guarantee', () => {
    expect(pill({ tone: 'loud' })).toBe(pill({ tone: 'loud' }));
    expect(pill({ tone: 'loud' }, { hover: true })).not.toBe(pill({ tone: 'loud' }));
  });

  it('carries the same introspection surface as the slotted form', () => {
    expect(pill.options).toEqual({ tone: ['quiet', 'loud'], size: ['sm', 'lg'] });
    expect(pill.slots).toEqual(['root']);
  });
});

describe('sv shorthand conflicts across layers', () => {
  // The problem `tailwind-merge` exists to solve. Every layer is normalised to
  // longhands at module load, so merging is last-wins per property and there is
  // no conflict table to own.
  it('lets a later layer beat an earlier, MORE SPECIFIC shorthand', () => {
    const r = sv({
      base: { px: 18 },
      variants: { size: { tight: { p: 12 } } },
      defaults: { size: 'tight' },
    });
    expect(r().root).toEqual({
      paddingTop: 12,
      paddingRight: 12,
      paddingBottom: 12,
      paddingLeft: 12,
    });
  });

  it('lets a later shorthand beat an earlier longhand', () => {
    const r = sv({
      base: { backgroundColor: '#111111' },
      variants: { tone: { loud: { bg: 'accent' } } },
      defaults: { tone: 'loud' },
    });
    expect(r().root).toEqual({ backgroundColor: 'var(--kroma-accent)' });
  });

  it('overrides only the edges a later layer names', () => {
    const r = sv({
      base: { p: 20 },
      variants: { tweak: { on: { pt: 4 } } },
      defaults: { tweak: 'on' },
    });
    expect(r().root).toEqual({
      paddingTop: 4,
      paddingRight: 20,
      paddingBottom: 20,
      paddingLeft: 20,
    });
  });

  it('generates keys in a stable order whatever contributed them', () => {
    const a = sv({ slots: { root: { bg: 'accent', px: 4 } } })().root;
    const b = sv({
      base: { px: 4 },
      variants: { t: { on: { bg: 'accent' } } },
      defaults: { t: 'on' },
    })().root;
    // Same styles reached two ways serialise identically, so the stylesheet
    // react-native-web generates does not move between builds.
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('sv state masking', () => {
  it('collapses to one entry per variant combination when no state is declared', () => {
    const plain = sv({ base: { bg: 'accent' } });
    // Nothing declares `_hover`, so hovering cannot produce a different style,
    // and must not produce a different cache entry either.
    expect(plain({}, { hover: true })).toBe(plain({}, {}));
    expect(plain({}, { hover: true, focus: true, press: true, disabled: true })).toBe(plain());
  });

  it('separates entries only for the states a recipe actually declares', () => {
    const hoverOnly = sv({ base: { bg: 'accent', _hover: { bg: 'accentHover' } } });
    expect(hoverOnly({}, { hover: true })).not.toBe(hoverOnly({}, {}));
    // `disabled` is undeclared, so it does not split the cache.
    expect(hoverOnly({}, { disabled: true })).toBe(hoverOnly({}, {}));
  });

  it('sees a state declared on any layer, not just the base', () => {
    const r = sv({
      base: { bg: 'surface1' },
      variants: { tone: { loud: { _hover: { bg: 'accent' } } } },
      defaults: { tone: 'loud' },
    });
    expect(r({}, { hover: true }).root).toMatchObject({ backgroundColor: 'var(--kroma-accent)' });
  });
});

describe('sv boolean variants', () => {
  const toggle = sv({
    base: { bg: 'surface1' },
    variants: { active: { true: { bg: 'accent' }, false: {} } },
    defaults: { active: 'false' },
  });

  it('accepts a real boolean, not only the string spelling', () => {
    expect(toggle({ active: true }).root).toEqual(toggle({ active: 'true' }).root);
    expect(toggle({ active: false }).root).toEqual(toggle({ active: 'false' }).root);
  });

  it('shares one cache entry between the two spellings', () => {
    expect(toggle({ active: true })).toBe(toggle({ active: 'true' }));
  });

  it('needs only the `true` option: off is the base look', () => {
    const lone = sv({
      base: { bg: 'surface1' },
      variants: { active: { true: { bg: 'accent' } } },
      defaults: { active: false },
    });
    expect(lone({ active: true }).root).toEqual(toggle({ active: true }).root);
    expect(lone({ active: false }).root).toEqual(lone().root);
  });
});

describe('sv cache bounds', () => {
  it('stops caching past the cap rather than growing without bound', () => {
    const r = sv({ base: { bg: 'accent' }, variants: { n: { a: {} } } });
    // Undeclared picks each mint a key; well past the cap the recipe still
    // resolves correctly, it simply stops remembering.
    for (let i = 0; i < 1200; i++) r({ n: `x${i}` as 'a' });
    expect(r({ n: 'a' }).root).toEqual({ backgroundColor: 'var(--kroma-accent)' });
  });
});

describe('sv introspection', () => {
  it('does not retain the authored declaration', () => {
    // `config` was dropped: the normalised form is already held, and keeping the
    // declaration too doubled every recipe's resident footprint for one test.
    const r = sv({ base: { bg: 'accent' } });
    expect('config' in r).toBe(false);
  });
});
