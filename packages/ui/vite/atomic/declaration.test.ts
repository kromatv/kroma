import { StyleSheet } from 'react-native';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CompiledLeaf, compileDeclaration } from './declaration.ts';
import { Unstatic } from './module-scope.ts';
import { resolveAsBrowser } from './web-theme.ts';

beforeAll(() => resolveAsBrowser());

const css = (leaf: CompiledLeaf) => leaf.rules.map((rule) => rule.css);

function reads(leaf: CompiledLeaf, property: string): { variable: string; selector: string } {
  const value = String(leaf.values[property]);
  const carrier = leaf.rules.find((rule) => rule.css.endsWith(`:${value};}`));
  return {
    variable: value.slice('var('.length, value.indexOf(',')),
    selector: String(carrier?.css.split('{')[0]),
  };
}

describe('compileDeclaration', () => {
  it('resolves the vocabulary to longhands and a class per longhand', () => {
    const leaf = compileDeclaration({ row: true, px: 8, bg: 'accent', radius: 'sm' });

    expect(leaf.values).toEqual({
      flexDirection: 'row',
      paddingLeft: 8,
      paddingRight: 8,
      backgroundColor: 'var(--kroma-accent)',
      borderRadius: 8,
    });
    expect(leaf.rules.map((rule) => rule.css)).toContainEqual(
      expect.stringContaining('{background-color:var(--kroma-accent);}'),
    );
    expect(leaf.states).toBeUndefined();
  });

  it('emits the classes and rules the browser runtime would have minted', () => {
    const leaf = compileDeclaration({ py: 6, color: 'textMuted', opacity: 0.5 });

    StyleSheet.create({ probe: leaf.values as never });

    const runtime = (StyleSheet as unknown as { getSheet(): { textContent: string } }).getSheet()
      .textContent;
    for (const rule of leaf.rules) expect(runtime).toContain(rule.css);
  });

  it('orders a shorthand under the longhands, as the runtime does', () => {
    const leaf = compileDeclaration({ radius: 'lg', borderTopLeftRadius: 0 });

    const groups = Object.fromEntries(leaf.rules.map((rule) => [rule.css, rule.group]));
    const radius = Object.keys(groups).find((css) => css.includes('border-bottom-left-radius'));
    const corner = Object.keys(groups).find(
      (css) => /^\.[a-d]/.test(css) && css.includes('{border-top-left-radius:0px;}'),
    );
    expect(groups[radius as string]).toBeLessThan(groups[corner as string] as number);
  });

  it('compiles each interaction state to its own layer', () => {
    const leaf = compileDeclaration({
      bg: 'accent',
      _hover: { bg: 'accentHover' },
      _press: { opacity: 0.8 },
    });

    expect(Object.keys(leaf.states ?? {})).toEqual(['hover', 'press']);
    expect(leaf.states?.hover).toEqual({ backgroundColor: 'var(--kroma-accent-hover)' });
    expect(leaf.states?.press).toEqual({ opacity: 0.8 });
    expect(leaf.rules.map((rule) => rule.css)).toContainEqual(
      expect.stringContaining('{opacity:0.8;}'),
    );
  });

  it('compiles a value stated per state to the same layers', () => {
    const leaf = compileDeclaration({
      bg: { base: 'accent', hover: 'accentHover' },
      opacity: { press: 0.8 },
    });

    expect(Object.keys(leaf.states ?? {})).toEqual(['hover', 'press']);
    expect(leaf.states?.hover).toEqual({ backgroundColor: 'var(--kroma-accent-hover)' });
    expect(leaf.states?.press).toEqual({ opacity: 0.8 });
  });

  it('leaves the runtime what only it can resolve', () => {
    expect(() => compileDeclaration({ width: (() => 1) as never })).toThrow(Unstatic);
    expect(() => compileDeclaration({ width: (() => 1) as never })).toThrow(/a function/);
    expect(() => compileDeclaration({ row: { base: false, md: true } })).toThrow(
      /flexDirection stated at some breakpoints and not others/,
    );
  });

  it('reads a value stated per breakpoint off a custom property the step restates', () => {
    const leaf = compileDeclaration({ px: { base: 8, md: 12 }, gap: { base: 4, lg: 8 } });

    const gap = reads(leaf, 'gap');
    const padding = reads(leaf, 'paddingLeft');

    expect(leaf.values.gap).toBe(`var(${gap.variable},4px)`);
    expect(leaf.values.paddingLeft).toBe(`var(${padding.variable},8px)`);
    expect(css(leaf)).toContain(`:root[data-kroma-bp~="lg"] ${gap.selector}{${gap.variable}:8px;}`);
    expect(css(leaf)).toContain(
      `:root[data-kroma-bp~="md"] ${padding.selector}{${padding.variable}:12px;}`,
    );
  });

  it('restates a wider step after a narrower one, which is all that separates them', () => {
    const leaf = compileDeclaration({ px: { base: 8, md: 12, lg: 16 } });

    const steps = leaf.rules.filter((rule) => rule.css.startsWith(':root'));

    expect(steps[0]?.css).toContain('~="md"');
    expect(steps[1]?.css).toContain('~="lg"');
    expect(steps[0]?.group).toBeLessThan(steps[1]?.group as number);
  });

  it('carries one class for the whole cascade, so a later layer replaces every step', () => {
    const responsive = compileDeclaration({ px: { base: 8, md: 12 } });
    const flat = compileDeclaration({ px: 8 });

    expect(Object.keys(responsive.values)).toEqual(Object.keys(flat.values));
    expect(responsive.values.paddingLeft).not.toBe(flat.values.paddingLeft);
  });

  it('states a step inside an interaction coat the same way', () => {
    const leaf = compileDeclaration({ bg: 'accent', _hover: { px: { base: 2, md: 4 } } });

    expect(leaf.states?.hover?.paddingLeft).toMatch(/^var\(--k[\w-]{6},2px\)$/);
    expect(leaf.rules.filter((rule) => rule.css.startsWith(':root'))).toHaveLength(2);
  });

  it('leaves the runtime a longhand one step states and another does not', () => {
    expect(() => compileDeclaration({ row: { base: false, md: true } })).toThrow(
      /stated at some breakpoints and not others/,
    );
    expect(() => compileDeclaration({ row: { base: true, md: false } })).toThrow(
      /a flexDirection stated at some breakpoints and not others/,
    );
  });

  it('refuses a step on a property the vocabulary does not cascade, rather than a bag', () => {
    expect(() => compileDeclaration({ display: { base: 'flex', md: 'none' } } as never)).toThrow(
      /a display stated per breakpoint/,
    );
    expect(() =>
      compileDeclaration({ transform: { base: [{ scale: 1 }], md: [{ scale: 2 }] } } as never),
    ).toThrow(/a transform stated per breakpoint/);
  });

  it('keeps what the browser cannot paint in the values, with no rule for it', () => {
    const leaf = compileDeclaration({ resizeMode: 'cover', tintColor: 'accent' } as never);

    expect(leaf.rules).toEqual([]);
    expect(leaf.values).toEqual({ resizeMode: 'cover', tintColor: 'var(--kroma-accent)' });
  });
});
