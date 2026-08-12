// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
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
  it('opens the row that was pressed, and closes behind it', () => {
    const { onSelect, onClose } = show();
    fireEvent.click(row('Chip'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'chip' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens the row under the cursor on Enter', () => {
    const { onSelect } = show();
    key('ArrowDown');
    key('Enter');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'spacing' }));
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
