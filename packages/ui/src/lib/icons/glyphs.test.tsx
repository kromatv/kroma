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

// `IconName` is derived from the package's export names by a type-level copy of
// `slugOf`; these guard that derivation and fail the typecheck, not the test run.

type Assert<T extends true> = T;
type Has<N extends string> = N extends IconName ? true : false;

/** Exported as one tuple so the aliases count as used under `noUnusedLocals`. */
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
    for (const name of ['chevron-right', 'badge-4k', 'rotate-clockwise-2', 'eye-off']) {
      expect(slugOf(exportName(name)), name).toBe(name);
    }
  });
});

describe('the icon set', () => {
  it('resolves any Tabler name without it being registered anywhere', () => {
    for (const name of ['wave-sine', 'ghost', 'rocket', 'coffee', 'brand-github'] as const) {
      expect(hasGlyph(name), name).toBe(true);
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector('svg'), name).toBeTruthy();
      unmount();
    }
  });

  it('falls back instead of throwing on a name that does not exist', () => {
    // A literal would not compile, so the guard is exercised as a name arriving
    // from data would be: an unproven string.
    const fromData: string = 'not-a-real-icon';
    expect(hasGlyph(fromData)).toBe(false);
    expect(glyphFor(fromData)).toBe(FALLBACK);
    const name = hasGlyph(fromData) ? fromData : 'help-circle';
    const { container } = render(<Icon name={name} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('lists the whole set for the gallery, kebab-cased', () => {
    const names = iconNames();
    expect(names.length).toBeGreaterThan(4000);
    expect(names).toContain('player-play-filled');
    expect(names.every((name) => name === name.toLowerCase())).toBe(true);
    expect([...names].sort()).toEqual(names);
  });

  it('passes the size and the outline weight through to the glyph', () => {
    const { container } = render(<Icon name="check" size={40} stroke={1.5} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('40');
    // The two Tabler packages disagree on the prop name for the weight (see
    // icons/stroke-prop.ts); either way it must reach the element.
    expect(svg?.getAttribute('stroke-width')).toBe('1.5');
  });
});
