// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from '#ui/components/atoms/icon';
import {
  exportName,
  FALLBACK,
  glyphFor,
  hasGlyph,
  type IconName,
  iconNames,
  slugOf,
} from './glyphs';

afterEach(cleanup);

// ---- compile-time assertions ----
//
// `IconName` is DERIVED from the package's export names by a type-level copy of
// `slugOf` (see glyphs.ts). These fail the typecheck rather than the test run,
// which is the point: they guard the derivation itself.

type Assert<T extends true> = T;
type Has<N extends string> = N extends IconName ? true : false;

/**
 * Exported as one tuple so the aliases are used (the package compiles with
 * `noUnusedLocals`), and so a failure names the position that broke.
 *
 * In order: the derivation produced a real UNION rather than collapsing to
 * `string` (a broken `infer` or a widened accumulator would still accept every
 * slug, and every other string with it); a plain name; a name with the `-filled`
 * suffix; both digit boundaries `slugOf` handles at runtime; and a typo, which
 * must NOT be in the union, since that is the whole reason to derive it.
 */
export type IconSlugChecks = [
  Assert<string extends IconName ? false : true>,
  Assert<Has<'wave-sine'>>,
  Assert<Has<'player-play-filled'>>,
  Assert<Has<'volume-2'>>,
  Assert<Has<'badge-4k'>>,
  Assert<Has<'chevron-rihgt'> extends false ? true : false>,
];

describe('name translation', () => {
  it('turns a design name into Tabler’s export name and back', () => {
    expect(exportName('wave-sine')).toBe('IconWaveSine');
    expect(exportName('player-play-filled')).toBe('IconPlayerPlayFilled');
    expect(exportName('x')).toBe('IconX');
    expect(slugOf('IconPlayerPlayFilled')).toBe('player-play-filled');
    expect(slugOf('IconVolume2')).toBe('volume-2');
    // Round-trips, which is what lets the gallery list names the app can pass
    // straight back to <Icon>.
    for (const name of ['chevron-right', 'badge-4k', 'rotate-clockwise-2', 'eye-off']) {
      expect(slugOf(exportName(name)), name).toBe(name);
    }
  });
});

describe('the icon set', () => {
  it('resolves any Tabler name without it being registered anywhere', () => {
    // None of these were ever in a list; they exist because the package does,
    // and they type-check as names because the union is derived from it.
    for (const name of ['wave-sine', 'ghost', 'rocket', 'coffee', 'brand-github'] as const) {
      expect(hasGlyph(name), name).toBe(true);
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector('svg'), name).toBeTruthy();
      unmount();
    }
  });

  it('falls back instead of throwing on a name that does not exist', () => {
    // `<Icon name="not-a-real-icon" />` does not COMPILE now, which is the
    // point of the derived union - so the runtime guard is exercised the way a
    // name arriving from data would be, as an unproven string.
    const fromData: string = 'not-a-real-icon';
    expect(hasGlyph(fromData)).toBe(false);
    expect(glyphFor(fromData)).toBe(FALLBACK);
    // ...and this is the narrowing a caller with such a string is meant to do.
    const name = hasGlyph(fromData) ? fromData : 'help-circle';
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('lists the whole set for the gallery, kebab-cased', () => {
    const names = iconNames();
    expect(names.length).toBeGreaterThan(4000);
    expect(names).toContain('player-play-filled');
    // Sorted, and nothing leaks the PascalCase spelling.
    expect(names.every((name) => name === name.toLowerCase())).toBe(true);
    expect([...names].sort()).toEqual(names);
  });

  it('passes the size and the outline weight through to the glyph', () => {
    const { container } = render(<Icon name="check" size={40} stroke={1.5} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('40');
    // The two Tabler packages disagree on the prop NAME for the weight (see
    // icons/stroke-prop.ts); either way it must reach the element.
    expect(svg?.getAttribute('stroke-width')).toBe('1.5');
  });
});
