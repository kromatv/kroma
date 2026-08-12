import { describe, expect, it } from 'vitest';
import {
  type CommandItem,
  flatten,
  METRICS,
  matches,
  offsetOf,
  scrollTo,
  sectionsOf,
  stepTo,
} from './command-list';

const at = (label: string, group: string, keywords?: string): CommandItem => ({
  id: label.toLowerCase(),
  label,
  group,
  keywords,
});

const ITEMS = [
  at('Colors', 'Foundations', 'tokens'),
  at('Button', 'Actions'),
  at('Chip', 'Actions'),
  at('Field', 'Input'),
];

describe('sectionsOf', () => {
  it('groups by section, in the order the items were given', () => {
    const sections = sectionsOf(ITEMS, '');
    expect(sections.map((section) => section.title)).toEqual(['Foundations', 'Actions', 'Input']);
    expect(sections[1]?.items.map((item) => item.label)).toEqual(['Button', 'Chip']);
  });

  it('drops a section the query leaves empty rather than showing an empty heading', () => {
    const sections = sectionsOf(ITEMS, 'ch');
    expect(sections.map((section) => section.title)).toEqual(['Actions']);
    expect(flatten(sections).map((item) => item.label)).toEqual(['Chip']);
  });

  it('searches the section and the keywords as well as the label', () => {
    expect(flatten(sectionsOf(ITEMS, 'actions'))).toHaveLength(2);
    expect(flatten(sectionsOf(ITEMS, 'tokens')).map((item) => item.label)).toEqual(['Colors']);
    expect(flatten(sectionsOf(ITEMS, 'zzz'))).toHaveLength(0);
  });

  it('leaves an item that names no section in a run of its own', () => {
    const loose = sectionsOf([{ id: 'a', label: 'Alone' }], '');
    expect(loose).toEqual([{ title: '', items: [{ id: 'a', label: 'Alone' }] }]);
  });

  it('ignores the case and the padding of a query', () => {
    expect(matches(ITEMS[0] as CommandItem, 'colors')).toBe(true);
    expect(flatten(sectionsOf(ITEMS, '  CHIP  ')).map((item) => item.label)).toEqual(['Chip']);
  });
});

describe('offsetOf', () => {
  const sections = sectionsOf(ITEMS, '');

  it('puts the first result under the first heading', () => {
    expect(offsetOf(sections, 0)).toBe(METRICS.pad + METRICS.heading);
  });

  it('counts every heading it passes on the way down', () => {
    expect(offsetOf(sections, 1)).toBe(
      METRICS.pad + METRICS.heading + METRICS.row + METRICS.separator + METRICS.heading,
    );
    expect(offsetOf(sections, 2) - offsetOf(sections, 1)).toBe(METRICS.row);
  });

  // The pixel looks like rounding and is not: the offset is arithmetic rather
  // than a measurement, so it accumulates - four sections down the cursor was
  // computed 4pt above where it sits, which is enough to make the in-view test
  // wrong at the edge and jump the scroller.
  it('counts the hairline between sections, which the list actually draws', () => {
    const across = offsetOf(sections, 1) - offsetOf(sections, 0);
    expect(across).toBe(METRICS.row + METRICS.separator + METRICS.heading);
  });

  it('skips the heading of a run that has no title', () => {
    const loose = sectionsOf([{ id: 'a', label: 'Alone' }], '');
    expect(offsetOf(loose, 0)).toBe(METRICS.pad);
  });

  it('grows monotonically, so the scroller never jumps backwards', () => {
    const offsets = flatten(sections).map((_, index) => offsetOf(sections, index));
    for (let index = 1; index < offsets.length; index += 1) {
      expect(offsets[index]).toBeGreaterThan(offsets[index - 1] as number);
    }
  });
});

describe('scrollTo', () => {
  const sections = sectionsOf(ITEMS, '');

  it('leaves the list alone while the row is already on screen', () => {
    expect(scrollTo(sections, 0, 0, METRICS.maxHeight)).toBeNull();
  });

  it('brings a row below the fold up by as little as it can', () => {
    expect(scrollTo(sections, 3, 0, 100)).toBe(
      offsetOf(sections, 3) + METRICS.row - 100 + METRICS.pad,
    );
  });

  it('comes back up to a row above what is shown', () => {
    expect(scrollTo(sections, 0, 200, METRICS.maxHeight)).toBe(offsetOf(sections, 0) - METRICS.pad);
  });
});

describe('stepTo', () => {
  it('wraps at both ends', () => {
    expect(stepTo(3, 1, 4)).toBe(0);
    expect(stepTo(0, -1, 4)).toBe(3);
  });

  it('keeps a page step non-negative before it wraps', () => {
    expect(stepTo(1, -8, 4)).toBe(1);
    expect(stepTo(0, 8, 11)).toBe(8);
  });

  it('stays at the top of a list with nothing in it', () => {
    expect(stepTo(0, 1, 0)).toBe(0);
  });

  it('brings a cursor past the end back inside before stepping', () => {
    expect(stepTo(99, 1, 4)).toBe(0);
  });
});
