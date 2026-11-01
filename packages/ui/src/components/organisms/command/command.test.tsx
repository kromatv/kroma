// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { layout, onScreen } from '#ui/testing';
import { Command } from './command';
import { useCommandResults } from './command-context';
import { type CommandItem, METRICS, offsetOf, sectionsOf } from './command-list';

const at = (label: string, group: string): CommandItem => ({
  id: label.toLowerCase(),
  label,
  group,
});

const ITEMS = [
  ...['Colors', 'Spacing', 'Type'].map((name) => at(name, 'Foundations')),
  ...['Button', 'Chip', 'IconButton', 'Menu', 'Toolbar'].map((name) => at(name, 'Actions')),
  ...['Field', 'Select', 'Switch'].map((name) => at(name, 'Input')),
];

afterEach(cleanup);

function show(children?: ReactNode) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    onScreen(
      <Command.Root items={ITEMS} selected="colors" onSelect={onSelect} onClose={onClose}>
        <Command.Input label="Search the list" />
        <Command.List />
        {children ?? <Command.Empty>No results.</Command.Empty>}
      </Command.Root>,
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

const sections = sectionsOf(ITEMS, '');

describe('Command', () => {
  it('draws a modal palette as a dialog holding its field', () => {
    render(
      onScreen(
        <Command.Root modal items={ITEMS} onSelect={vi.fn()} onClose={vi.fn()}>
          <Command.Input label="Search the list" />
          <Command.List />
        </Command.Root>,
      ),
    );

    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByLabelText('Search the list')).toBeTruthy();
  });

  it('holds the dialog role and the focus under StrictMode', async () => {
    render(
      <StrictMode>
        {onScreen(
          <Command.Root modal items={ITEMS} onSelect={vi.fn()} onClose={vi.fn()}>
            <Command.Input label="Search the list" />
          </Command.Root>,
        )}
      </StrictMode>,
    );

    const dialog = await screen.findByRole('dialog');

    expect(document.activeElement).toBe(within(dialog).getByLabelText('Search the list'));
  });

  it('draws an item’s artwork, and its icon when there is no artwork to load', () => {
    const items: CommandItem[] = [
      { id: 'dune', label: 'Dune', icon: 'movie', image: 'https://example.test/dune.jpg' },
    ];
    render(
      onScreen(
        <Command.Root items={items} onSelect={vi.fn()} onClose={vi.fn()}>
          <Command.List />
        </Command.Root>,
      ),
    );

    expect(row('Dune').querySelector('img')?.getAttribute('src')).toBe(
      'https://example.test/dune.jpg',
    );
  });

  it('draws a tile’s art and an icon’s glyph in wells of one size', () => {
    const items: CommandItem[] = [
      {
        id: 'tile',
        label: 'Tile',
        icon: 'puzzle',
        image: 'https://example.test/a.svg',
        imageShape: 'tile',
      },
      { id: 'glyph', label: 'Glyph', icon: 'puzzle' },
    ];
    render(
      onScreen(
        <Command.Root items={items} onSelect={vi.fn()} onClose={vi.fn()}>
          <Command.List />
        </Command.Root>,
      ),
    );

    const wellOf = (name: string) => row(name).firstElementChild as HTMLElement;

    expect(wellOf('Tile').className).toBe(wellOf('Glyph').className);
    expect(row('Tile').querySelector('img')?.getAttribute('src')).toBe(
      'https://example.test/a.svg',
    );
  });

  it('draws a row’s status as a badge', () => {
    const items: CommandItem[] = [
      { id: 'roku', label: 'Roku', status: { label: 'Stopped', tone: 'danger' } },
    ];
    render(
      onScreen(
        <Command.Root items={items} onSelect={vi.fn()} onClose={vi.fn()}>
          <Command.List />
        </Command.Root>,
      ),
    );

    expect(within(row('Roku')).getByText('Stopped')).toBeTruthy();
  });

  it('names a row’s section at its end while searching, as no heading is drawn', () => {
    render(
      onScreen(
        <Command.Root items={ITEMS} defaultQuery="chi" onSelect={vi.fn()} onClose={vi.fn()}>
          <Command.List />
        </Command.Root>,
      ),
    );

    expect(within(row('Chip')).getByText('Actions')).toBeTruthy();
  });

  it('marks the letters of a label that the query matched', () => {
    render(
      onScreen(
        <Command.Root items={ITEMS} defaultQuery="chi" onSelect={vi.fn()} onClose={vi.fn()}>
          <Command.List />
        </Command.Root>,
      ),
    );

    expect(within(row('Chip')).getByText('Chi')).toBeTruthy();
  });

  it('opens the first row on Enter when a row merely arrived under a resting pointer', () => {
    const { onSelect } = show();

    fireEvent.pointerEnter(row('Chip'));
    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'colors' }), undefined);
  });

  it('moves the cursor to the row a moving pointer is on', () => {
    const { onSelect } = show();

    fireEvent.mouseMove(document);
    fireEvent.pointerEnter(row('Chip'));
    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'chip' }), undefined);
  });

  it('gives the focus back to what held it when a modal palette closes', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      onScreen(
        <Command.Root modal items={ITEMS} onSelect={vi.fn()} onClose={vi.fn()}>
          <Command.Input label="Search the list" />
        </Command.Root>,
      ),
    );
    await screen.findByRole('dialog');

    unmount();
    const refocused = document.activeElement === opener;
    opener.remove();

    expect(refocused).toBe(true);
  });

  it('closes a modal palette on Escape', () => {
    const onClose = vi.fn();
    render(
      onScreen(
        <Command.Root modal items={ITEMS} onSelect={vi.fn()} onClose={onClose}>
          <Command.Input label="Search the list" />
        </Command.Root>,
      ),
    );

    key('Escape');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the row that was pressed, and closes behind it', () => {
    const { onSelect, onClose } = show();
    fireEvent.click(row('Chip'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'chip' }), undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the row under the cursor on Enter', () => {
    const { onSelect } = show();
    key('ArrowDown');
    key('Enter');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'spacing' }), undefined);
  });

  it('closes on Escape without opening anything', () => {
    const { onSelect, onClose } = show();
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('swallows the keys it acts on, so nothing behind it moves as well', () => {
    show();
    expect(key('ArrowDown')).toBe(false);
    expect(key('a')).toBe(true);
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
    // PageDown steps eight rows: the ninth row of eleven sits below the fold.
    key('PageDown');
    expect(asked).toEqual([offsetOf(sections, 8) + METRICS.row - METRICS.maxHeight + METRICS.pad]);
  });

  it('measures the fold from the list rather than assuming it', () => {
    show();
    const asked = watchScroll();
    layout(scroller(), { height: 100 });
    key('ArrowDown');
    expect(asked).toEqual([offsetOf(sections, 1) + METRICS.row - 100 + METRICS.pad]);
  });

  it('reads back where the list was scrolled to by hand', () => {
    show();
    const node = scroller();
    const asked = watchScroll();
    Object.defineProperty(node, 'scrollTop', { configurable: true, value: 200 });
    fireEvent.scroll(node);
    key('ArrowDown');
    expect(asked).toEqual([offsetOf(sections, 1) - METRICS.pad]);
  });

  it('swaps the list for the empty face, and back', () => {
    show(<Command.Empty>Nothing here.</Command.Empty>);
    expect(screen.queryByText('Nothing here.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search the list'), { target: { value: 'zzzz' } });
    expect(screen.getByText('Nothing here.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chip' })).toBeNull();
  });

  it('hands a footer what the query left, live', () => {
    show(
      <Command.Footer>
        <Tally />
      </Command.Footer>,
    );
    expect(screen.getByText('11 of 11')).toBeTruthy();
    // Chip and Switch.
    fireEvent.change(screen.getByLabelText('Search the list'), { target: { value: 'ch' } });
    expect(screen.getByText('2 of 11')).toBeTruthy();
  });

  it('reports what a reader typed, and takes a query from its caller', () => {
    const typed = vi.fn();
    render(
      onScreen(
        <Command.Root
          items={ITEMS}
          query="chip"
          onQueryChange={typed}
          onSelect={vi.fn()}
          onClose={vi.fn()}
        >
          <Command.Input label="Search" />
          <Command.List />
        </Command.Root>,
      ),
    );
    expect(screen.queryByRole('button', { name: 'Button' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'menu' } });
    expect(typed).toHaveBeenCalledWith('menu');
    // Controlled: the list stays where its caller put it.
    expect(screen.getByRole('button', { name: 'Chip' })).toBeTruthy();
  });

  it('closes when the scrim is pressed', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByLabelText('Close search'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

function Tally() {
  const { shown, total } = useCommandResults();
  return <Text>{`${shown} of ${total}`}</Text>;
}
