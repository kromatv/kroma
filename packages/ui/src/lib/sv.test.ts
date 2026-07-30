import { describe, expect, it } from 'vitest';
import { sv } from './sv';

const button = sv({
  base: { borderRadius: 10 },
  variants: {
    variant: {
      primary: { backgroundColor: '#F4B642' },
      ghost: { backgroundColor: 'transparent' },
    },
    size: {
      sm: { paddingHorizontal: 20 },
      md: { paddingHorizontal: 36 },
    },
  },
  compound: [{ when: { variant: 'ghost', size: 'sm' }, style: { borderWidth: 1 } }],
  defaults: { variant: 'primary', size: 'md' },
});

describe('sv', () => {
  it('applies the defaults when the caller passes nothing', () => {
    expect(button()).toEqual([
      { borderRadius: 10 },
      { backgroundColor: '#F4B642' },
      { paddingHorizontal: 36 },
    ]);
  });

  it('overrides only the variant the caller names', () => {
    expect(button({ variant: 'ghost' })).toEqual([
      { borderRadius: 10 },
      { backgroundColor: 'transparent' },
      { paddingHorizontal: 36 },
    ]);
  });

  it('applies a compound rule only when every condition matches', () => {
    expect(button({ variant: 'ghost', size: 'sm' })).toContainEqual({ borderWidth: 1 });
    expect(button({ variant: 'primary', size: 'sm' })).not.toContainEqual({ borderWidth: 1 });
  });

  it('matches a compound rule against a value that came from the defaults', () => {
    // `size` defaults to md, so the rule requiring sm must not fire.
    expect(button({ variant: 'ghost' })).not.toContainEqual({ borderWidth: 1 });
  });

  it("puts the caller's own style last so a one-off override wins", () => {
    const out = button({ variant: 'primary' }, { backgroundColor: 'red' });
    expect(out.at(-1)).toEqual({ backgroundColor: 'red' });
  });

  it('drops falsy overrides so `cond && style` is safe to pass', () => {
    expect(button({}, false, null, undefined)).toHaveLength(3);
  });

  it('works with no variants at all', () => {
    expect(sv({ base: { flex: 1 } })()).toEqual([{ flex: 1 }]);
    expect(sv({})()).toEqual([]);
  });

  it('returns the SAME array for the same combination, so a re-render is identity-equal', () => {
    expect(button({ variant: 'ghost' })).toBe(button({ variant: 'ghost' }));
    expect(button()).toBe(button({ variant: 'primary', size: 'md' }));
    expect(button({ variant: 'ghost' })).not.toBe(button());
  });

  it('never lets an override leak into the cached combination', () => {
    const before = button({ variant: 'ghost' });
    const overridden = button({ variant: 'ghost' }, { backgroundColor: 'red' });
    expect(overridden).not.toBe(before);
    expect(button({ variant: 'ghost' })).toBe(before);
    expect(before).not.toContainEqual({ backgroundColor: 'red' });
  });
});

describe('sv slots', () => {
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

  it('resolves every slot, applying only the styles an option declares for it', () => {
    const s = card({ size: 'sm', tone: 'loud' });
    expect(s.root).toEqual([{ borderRadius: 10 }, { padding: 12 }, { borderWidth: 1 }]);
    expect(s.label).toEqual([{ fontWeight: '700' }, { fontSize: 13 }, { color: '#F4B642' }]);
  });

  it('applies the defaults when the caller passes nothing', () => {
    const s = card();
    expect(s.root).toEqual([{ borderRadius: 10 }, { padding: 20 }]);
    expect(s.label).toEqual([{ fontWeight: '700' }, { fontSize: 16 }]);
  });

  it('returns the SAME object for the same combination', () => {
    expect(card({ size: 'sm' })).toBe(card({ size: 'sm' }));
    expect(card()).toBe(card({ size: 'md', tone: 'plain' }));
  });

  it('carries the introspection surface the workbench reads', () => {
    expect(card.options).toEqual({ size: ['md', 'sm'], tone: ['plain', 'loud'] });
    expect(card.defaults).toEqual({ size: 'md', tone: 'plain' });
  });
});
