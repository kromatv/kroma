// @vitest-environment jsdom
//
// The palette itself is `@kroma/ui`'s <Command>, and is tested there. What is
// left here is the mapping: a story and an article both have to arrive as rows
// the palette can rank, and a chosen row has to say which of the two lists it
// came from.

import { onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette, entriesOf, isPage } from './command';
import type { StoryEntry } from './entry';
import type { Page } from './page';

// Enough of an index row for the palette: a name, a section, a level.
const at = (name: string, group: string, tier: string) =>
  ({ id: name.toLowerCase(), name, group, tier }) as StoryEntry;

const STORIES = [
  at('Colors', 'Foundations', 'Foundations'),
  at('Button', 'Actions', 'Atoms'),
  at('Chip', 'Actions', 'Atoms'),
  at('Field', 'Input', 'Molecules'),
];

const PAGES = [
  {
    id: 'icons',
    title: 'Icons',
    group: 'Guides',
    summary: 'Every Tabler glyph the kit can draw.',
    path: 'x',
    content: (() => null) as never,
  },
  {
    id: 'composition',
    title: 'Composition',
    group: 'Guides',
    summary: 'Parts, and when a data prop beats children.',
    path: 'y',
    content: (() => null) as never,
  },
] as unknown as Page[];

afterEach(cleanup);

describe('entriesOf', () => {
  it('lists the articles first, in their own section, and every story after', () => {
    const rows = entriesOf(STORIES, PAGES);
    expect(rows.map((row) => row.label)).toEqual([
      'Icons',
      'Composition',
      'Colors',
      'Button',
      'Chip',
      'Field',
    ]);
    expect(rows.slice(0, 2).every((row) => row.group === 'Guides')).toBe(true);
  });

  it('gives an article one glyph of its own and a story its section glyph', () => {
    const rows = entriesOf(STORIES, PAGES);
    expect(rows[0]?.icon).toBe('book');
    expect(rows[3]?.icon).toBe('pointer');
  });

  // The summary is the only thing about an article that says what is inside it,
  // so a word from it has to be enough to find the page.
  it('hands the summary over as searchable keywords', () => {
    expect(entriesOf(STORIES, PAGES)[0]?.keywords).toBe('Every Tabler glyph the kit can draw.');
    expect(entriesOf(STORIES, PAGES)[2]?.keywords).toBe('Foundations');
  });
});

describe('isPage', () => {
  it('tells an article apart from a story by the list it came from', () => {
    expect(isPage(PAGES, 'icons')).toBe(true);
    expect(isPage(PAGES, 'chip')).toBe(false);
    expect(isPage(undefined, 'icons')).toBe(false);
  });
});

describe('the palette the workbench mounts', () => {
  function show() {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      onScreen(
        <CommandPalette
          stories={STORIES}
          pages={PAGES}
          selected="colors"
          onSelect={onSelect}
          onClose={onClose}
        />,
      ),
    );
    return { onSelect, onClose };
  }

  it('opens a story by id, saying it is not an article', () => {
    const { onSelect, onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Chip' }));
    expect(onSelect).toHaveBeenCalledWith('chip', false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens an article the same way, saying that it is one', () => {
    const { onSelect } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Icons' }));
    expect(onSelect).toHaveBeenCalledWith('icons', true);
  });

  it('finds an article by a word in its summary, not only its title', () => {
    show();
    fireEvent.change(screen.getByLabelText('Search the component list'), {
      target: { value: 'tabler' },
    });
    expect(screen.getByRole('button', { name: 'Icons' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chip' })).toBeNull();
  });

  it('counts what is showing against everything it holds', () => {
    show();
    expect(screen.getByText('6 of 6')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search the component list'), {
      target: { value: 'chip' },
    });
    expect(screen.getByText('1 of 6')).toBeTruthy();
  });

  it('says so rather than showing an empty sheet', () => {
    show();
    fireEvent.change(screen.getByLabelText('Search the component list'), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText('No components found.')).toBeTruthy();
  });
});
