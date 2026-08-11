// @vitest-environment jsdom
//
// The palette's arithmetic first, then the panel that runs on it: the grouping
// has to agree with the sidebar's about where a component lives, and `offsetOf`
// is the difference between a palette you can hold Down on and one whose cursor
// walks off the bottom edge. It is arithmetic rather than a measurement pass
// precisely so it can be checked on its own.

import { layout, onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette, commandGroups, flatten, offsetOf } from './command';
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

afterEach(cleanup);

const LONG = [
  ...['Colors', 'Spacing', 'Type'].map((name) => at(name, 'Foundations', 'Foundations')),
  ...['Button', 'Chip', 'IconButton', 'Menu', 'Toolbar'].map((name) =>
    at(name, 'Actions', 'Atoms'),
  ),
  ...['Field', 'Select', 'Switch'].map((name) => at(name, 'Input', 'Molecules')),
];

describe('the palette on screen', () => {
  function show() {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      onScreen(
        <CommandPalette
          stories={LONG}
          selected="colors"
          onSelect={onSelect}
          onClose={onClose}
          width={800}
        />,
      ),
    );
    return { onSelect, onClose };
  }

  const row = (name: string) => screen.getByRole('button', { name });

  // <ScrollView> draws the scroller around a content container, so the box that
  // scrolls is two levels above a row.
  const scroller = () => row('Colors').parentElement?.parentElement?.parentElement as HTMLElement;

  // jsdom lays nothing out and scrolls nothing, so the scroll the palette asks
  // for is recorded rather than performed.
  function watchScroll(): number[] {
    const asked: number[] = [];
    const node = scroller();
    node.scroll = ((options: ScrollToOptions) => {
      asked.push(options.top ?? 0);
    }) as typeof node.scroll;
    return asked;
  }

  const key = (name: string) => fireEvent.keyDown(document, { key: name });

  it('opens the story whose row was pressed, and closes', () => {
    const { onSelect, onClose } = show();
    fireEvent.click(row('Chip'));
    expect(onSelect).toHaveBeenCalledWith('chip');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves the list alone while the cursor is still on screen', () => {
    show();
    const asked = watchScroll();
    key('ArrowDown');
    expect(asked).toEqual([]);
  });

  it('scrolls just far enough to bring a cursor past the fold back into view', () => {
    show();
    const asked = watchScroll();
    // PageDown steps eight rows: the ninth row of eleven sits below a 320pt fold.
    key('PageDown');
    expect(asked).toEqual([offsetOf(commandGroups(LONG, ''), 8) + 36 - 320 + 6]);
  });

  it('measures the fold from the list rather than assuming it', () => {
    show();
    const asked = watchScroll();
    layout(scroller(), { height: 100 });
    key('ArrowDown');
    // The second row ends at 104, past a 100pt fold - and would have been well
    // inside the 320 the palette starts with.
    expect(asked).toEqual([offsetOf(commandGroups(LONG, ''), 1) + 36 - 100 + 6]);
  });

  it('reads back where the list was scrolled to by hand', () => {
    show();
    const node = scroller();
    const asked = watchScroll();
    Object.defineProperty(node, 'scrollTop', { configurable: true, value: 200 });
    fireEvent.scroll(node);

    key('ArrowDown');
    // Above the top of what is now shown, so the list comes back up to it.
    expect(asked).toEqual([offsetOf(commandGroups(LONG, ''), 1) - 6]);
  });
});

// A television has no document, so the palette registers no key listener and
// the field's own submit is the only thing Enter can reach. `webDocument` is
// the seam the kit puts that question behind, so flipping it here is the whole
// difference between the two targets.
describe('the palette on a target with no document', () => {
  it('opens the row under the cursor when the field submits', async () => {
    vi.resetModules();
    vi.doMock('@kroma/ui/kit', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@kroma/ui/kit')>()),
      webDocument: () => null,
    }));

    const { CommandPalette: Palette } = await import('./command');
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      onScreen(
        <Palette
          stories={LONG}
          selected="colors"
          onSelect={onSelect}
          onClose={onClose}
          width={800}
        />,
      ),
    );

    fireEvent.keyDown(screen.getByLabelText('Search the component list'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('colors');
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.doUnmock('@kroma/ui/kit');
    vi.resetModules();
  });
});
