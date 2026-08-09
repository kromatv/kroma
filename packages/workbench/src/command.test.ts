// The palette's arithmetic, without a renderer.
//
// Two things in command.tsx are worth testing on their own: the grouping, which
// has to agree with the sidebar's about where a component lives, and `offsetOf`,
// which is the difference between a palette you can hold Down on and one whose
// cursor walks off the bottom edge. It is arithmetic rather than a measurement
// pass precisely so it can be checked here.

import { describe, expect, it } from 'vitest';
import { commandGroups, flatten, offsetOf } from './command';
import type { Story } from './story';

// Enough of a story for the palette: a name, a section, a level.
const at = (name: string, group: string, tier: string) =>
  ({ id: name.toLowerCase(), name, group, tier }) as Story;

const STORIES = [
  at('Colors', 'Foundations', 'Foundations'),
  at('Button', 'Actions', 'Atoms'),
  at('Chip', 'Actions', 'Atoms'),
  at('Field', 'Input', 'Molecules'),
];

describe('commandGroups', () => {
  it('groups by functional section, in the registry order', () => {
    const groups = commandGroups(STORIES, '');
    expect(groups.map((group) => group.title)).toEqual(['Foundations', 'Actions', 'Input']);
    expect(groups[1]?.items.map((story) => story.name)).toEqual(['Button', 'Chip']);
  });

  it('drops a section the query leaves empty rather than showing an empty heading', () => {
    const groups = commandGroups(STORIES, 'ch');
    expect(groups.map((group) => group.title)).toEqual(['Actions']);
    expect(flatten(groups).map((story) => story.name)).toEqual(['Chip']);
  });

  it('matches the section as well as the name', () => {
    expect(flatten(commandGroups(STORIES, 'actions'))).toHaveLength(2);
    expect(flatten(commandGroups(STORIES, 'zzz'))).toHaveLength(0);
  });
});

describe('offsetOf', () => {
  const groups = commandGroups(STORIES, '');

  it('puts the first result under the first heading', () => {
    // The list's own padding, then one heading.
    expect(offsetOf(groups, 0)).toBe(6 + 26);
  });

  it('counts every heading it passes on the way down', () => {
    // Second group: the pad, its own heading, plus the first group's heading,
    // its one row, and the hairline drawn after it.
    expect(offsetOf(groups, 1)).toBe(6 + 26 + 36 + 1 + 26);
    // ...and the row after it is exactly one row lower.
    expect(offsetOf(groups, 2) - offsetOf(groups, 1)).toBe(36);
  });

  it('counts the hairline between groups, which the list actually draws', () => {
    // Crossing a group boundary costs the row being left, the 1px rule after it
    // and the next heading. The pixel looks like rounding and is not: the offset
    // is arithmetic rather than a measurement, so it accumulates - four groups
    // down the cursor was computed 4px above where it sits, which is enough to
    // make the in-view test wrong at the edge and jump the scroller.
    const firstOfSecond = groups[0]?.items.length ?? 0;
    expect(firstOfSecond).toBeGreaterThan(0);
    const across = offsetOf(groups, firstOfSecond) - offsetOf(groups, firstOfSecond - 1);
    expect(across).toBe(36 + 1 + 26);
  });

  it('grows monotonically, so the scroller never jumps backwards', () => {
    const offsets = flatten(groups).map((_, index) => offsetOf(groups, index));
    for (let index = 1; index < offsets.length; index += 1) {
      expect(offsets[index]).toBeGreaterThan(offsets[index - 1] as number);
    }
  });
});
