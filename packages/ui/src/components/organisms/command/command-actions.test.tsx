// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { Command } from './command';
import { ACTION_METRICS, type CommandItem, METRICS, scrollActionsTo } from './command-list';

const OPEN = { id: 'open', label: 'Open' };
const PLAY = { id: 'play', label: 'Play' };
const REMOVE = { id: 'remove', label: 'Uninstall', danger: true };

const ROKU: CommandItem = { id: 'roku', label: 'Roku', actions: [OPEN, PLAY, REMOVE] };
const BARE: CommandItem = { id: 'bare', label: 'Bare' };

const CHORD = { key: 'k', ctrlKey: true };

function show(items: readonly CommandItem[] = [ROKU, BARE]) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    onScreen(
      <Command.Root modal items={items} onSelect={onSelect} onClose={onClose}>
        <Command.Input label="Search" />
        <Command.List />
        <Command.Footer>
          <Command.Trigger label="Actions" />
        </Command.Footer>
        <Command.Actions label="Search actions" closeLabel="Close actions" />
      </Command.Root>,
    ),
  );
  return { onSelect, onClose };
}

const key = (name: string, extra: object = {}) =>
  fireEvent.keyDown(document, { key: name, ...extra });

const chord = () => fireEvent.keyDown(document, CHORD);

const row = (name: string) => screen.queryByRole('button', { name });

const panelField = () => screen.queryByLabelText('Search actions');

beforeEach(() => {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64)');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('choosing from the list', () => {
  it('runs the first action on Enter', () => {
    const { onSelect, onClose } = show();

    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(ROKU, OPEN);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs the second action on Ctrl with Enter', () => {
    const { onSelect } = show();

    key('Enter', { ctrlKey: true });

    expect(onSelect).toHaveBeenCalledWith(ROKU, PLAY);
  });

  it('runs the second action on Command with Enter', () => {
    const { onSelect } = show();

    key('Enter', { metaKey: true });

    expect(onSelect).toHaveBeenCalledWith(ROKU, PLAY);
  });

  it('does nothing on Ctrl with Enter when there is no second action', () => {
    const { onSelect, onClose } = show([BARE]);

    key('Enter', { ctrlKey: true });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hands over no action for a row that has none', () => {
    const { onSelect } = show([BARE]);

    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(BARE, undefined);
  });
});

describe('the action panel', () => {
  it('opens on the key, over a menu that stays open', () => {
    const { onClose } = show();

    chord();

    expect(row('Uninstall')).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on the key again', () => {
    show();

    chord();
    chord();

    expect(row('Uninstall')).toBeNull();
  });

  it('closes on Escape, leaving the menu open', () => {
    const { onClose } = show();

    chord();
    key('Escape');

    expect(row('Uninstall')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when pressed around', () => {
    show();

    chord();
    fireEvent.click(row('Close actions') as HTMLElement);

    expect(row('Uninstall')).toBeNull();
  });

  it('takes the focus into its field, and gives it back', () => {
    show();
    const search = screen.getByLabelText('Search');
    search.focus();

    chord();
    const inPanel = document.activeElement === panelField();
    key('Escape');

    expect(inPanel).toBe(true);
    expect(document.activeElement).toBe(search);
  });

  it('runs the action under its cursor on Enter', () => {
    const { onSelect } = show();

    chord();
    key('ArrowDown');
    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(ROKU, PLAY);
  });

  it('wraps its cursor at both ends', () => {
    const { onSelect } = show();

    chord();
    key('ArrowUp');
    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(ROKU, REMOVE);
  });

  it('leaves the list’s cursor where it was', () => {
    const { onSelect } = show();

    chord();
    key('ArrowDown');
    key('Escape');
    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(ROKU, OPEN);
  });

  it('runs an action that was pressed', () => {
    const { onSelect } = show();

    chord();
    fireEvent.click(row('Uninstall') as HTMLElement);

    expect(onSelect).toHaveBeenCalledWith(ROKU, REMOVE);
  });

  it('narrows to what is typed in its field', () => {
    show();

    chord();
    fireEvent.change(panelField() as HTMLElement, { target: { value: 'unin' } });

    expect(row('Uninstall')).not.toBeNull();
    expect(row('Play')).toBeNull();
  });

  it('starts over each time it opens', () => {
    show();

    chord();
    fireEvent.change(panelField() as HTMLElement, { target: { value: 'unin' } });
    key('Escape');
    chord();

    expect(row('Play')).not.toBeNull();
  });

  it('closes the menu on the key when the row has nothing to offer, so the key is never dead', () => {
    const { onClose } = show([BARE]);

    chord();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('a panel longer than it can show', () => {
  const PANEL_IN_NO_WINDOW = METRICS.tallRow * 2 - ACTION_METRICS.chrome;

  const MANY: CommandItem = {
    id: 'many',
    label: 'Many',
    actions: [
      ...Array.from({ length: 11 }, (_, at) => ({ id: `a${at}`, label: `Action ${at}` })),
      REMOVE,
    ],
  };

  function watchScroll(): number[] {
    const asked: number[] = [];
    const scroller = row('Action 0')?.parentElement?.parentElement?.parentElement as HTMLElement;
    scroller.scroll = ((options: ScrollToOptions) => {
      asked.push(options.top ?? 0);
    }) as typeof scroller.scroll;
    return asked;
  }

  it('leaves the list alone while the cursor stays on screen', () => {
    show([MANY]);
    chord();
    const asked = watchScroll();

    key('ArrowDown');

    expect(asked).toEqual([]);
  });

  it('follows the cursor down to a row below the fold', () => {
    show([MANY]);
    chord();
    const asked = watchScroll();

    for (let press = 0; press < 8; press += 1) key('ArrowDown');

    expect(asked.length).toBeGreaterThan(0);
  });

  it('brings the dangerous action at the very end into view when the cursor wraps to it', () => {
    show([MANY]);
    chord();
    const asked = watchScroll();

    key('ArrowUp');

    expect(asked).toEqual([scrollActionsTo(MANY.actions ?? [], 11, 0, PANEL_IN_NO_WINDOW)]);
  });
});

describe('Command.Primary', () => {
  function showPrimary(items: readonly CommandItem[] = [ROKU, BARE]) {
    const onSelect = vi.fn();
    render(
      onScreen(
        <Command.Root modal items={items} onSelect={onSelect} onClose={vi.fn()}>
          <Command.Input label="Search" />
          <Command.Footer>
            <Command.Primary />
          </Command.Footer>
          <Command.Actions label="Search actions" closeLabel="Close actions" />
        </Command.Root>,
      ),
    );
    return { onSelect };
  }

  const footer = (name: string) => screen.queryAllByRole('button', { name }).at(-1);

  it('names what Enter will do for the row under the cursor', () => {
    showPrimary();

    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
  });

  it('runs it when pressed', () => {
    const { onSelect } = showPrimary();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(onSelect).toHaveBeenCalledWith(ROKU, OPEN);
  });

  it('follows the cursor to the row it moves to', () => {
    const other = { ...BARE, actions: [{ id: 'run', label: 'Run' }] };
    showPrimary([ROKU, other]);

    key('ArrowDown');

    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
  });

  it('names what the panel’s cursor is on while the panel is up', () => {
    showPrimary();

    chord();
    key('ArrowDown');

    expect(footer('Play')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Play' })).toHaveLength(2);
  });

  it('draws nothing for a row with nothing to run', () => {
    showPrimary([BARE]);

    const labels = screen.getAllByRole('button').map((one) => one.getAttribute('aria-label'));

    expect(labels).toEqual(['Close search']);
  });

  it('draws nothing when no row is left', () => {
    showPrimary();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } });

    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });
});

describe('Command.Trigger', () => {
  it('opens the panel', () => {
    show();

    fireEvent.click(row('Actions') as HTMLElement);

    expect(row('Uninstall')).not.toBeNull();
  });

  it('draws nothing for a row with nothing to offer', () => {
    show([BARE]);

    expect(row('Actions')).toBeNull();
  });
});

describe('useCommandResults', () => {
  it('still reports nothing to choose when the query leaves no rows', () => {
    const { onSelect } = show();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } });
    key('Enter');

    expect(onSelect).not.toHaveBeenCalled();
  });
});
