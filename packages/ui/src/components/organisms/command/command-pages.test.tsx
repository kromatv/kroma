// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onScreen } from '#ui/testing';
import { Command } from './command.component';
import type { CommandItem } from './command-list';

const action = (id: string, label: string) => ({ id: `${id}#${label}`, label });

const choice = (id: string, label: string): CommandItem => ({
  id,
  label,
  actions: [action(id, 'Choose')],
});

const LANGUAGE: CommandItem = {
  id: 'language',
  label: 'Interface language',
  group: 'Preferences',
  actions: [action('language', 'Open list'), action('language', 'Open page')],
  items: [choice('de', 'Deutsch'), choice('fr', 'Français'), choice('ja', '日本語')],
};

const ITEMS: CommandItem[] = [
  { id: 'home', label: 'Home', group: 'Pages', actions: [action('home', 'Open')] },
  { id: 'movies', label: 'Movies', group: 'Pages', actions: [action('movies', 'Open')] },
  LANGUAGE,
];

afterEach(cleanup);

function show(items: readonly CommandItem[] = ITEMS) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const palette = (list: readonly CommandItem[]) =>
    onScreen(
      <Command.Root items={list} onSelect={onSelect} onClose={onClose} backLabel="Back">
        <Command.Input label="Search" placeholder="Search everything" listPlaceholder="Filter" />
        <Command.List />
        <Command.Footer>
          <Command.Trigger label="Actions" />
        </Command.Footer>
        <Command.Actions label="Search actions" closeLabel="Close actions" />
      </Command.Root>,
    );
  const view = render(palette(items));
  return {
    onSelect,
    onClose,
    rerender: (list: readonly CommandItem[]) => view.rerender(palette(list)),
  };
}

const key = (name: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document, { key: name, ...init });
const type = (text: string) =>
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: text } });
const listed = (name: string) => screen.queryByRole('button', { name }) !== null;
const field = () => screen.getByLabelText<HTMLInputElement>('Search');

function openLanguage() {
  key('ArrowDown');
  key('ArrowDown');
  key('Enter');
}

describe('a row with a list of its own', () => {
  it('lists its rows in place of the palette’s on Enter, with the way back named', () => {
    const { onSelect, onClose } = show();

    openLanguage();

    expect(listed('Deutsch')).toBe(true);
    expect(listed('Home')).toBe(false);
    expect(screen.getByRole('button', { name: 'Back' }).textContent).toContain(
      'Interface language',
    );
    expect(field().placeholder).toBe('Filter');
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens its list when it is pressed', () => {
    show();

    fireEvent.click(screen.getByRole('button', { name: 'Interface language' }));

    expect(listed('Français')).toBe(true);
  });

  it('runs its other actions rather than opening the list', () => {
    const { onSelect, onClose } = show();
    key('ArrowDown');
    key('ArrowDown');

    key('Enter', { metaKey: true });

    expect(onSelect).toHaveBeenCalledWith(LANGUAGE, LANGUAGE.actions?.[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens its list from the action panel, and puts the panel away', () => {
    const { onSelect } = show();
    key('ArrowDown');
    key('ArrowDown');
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open list' }));

    expect(listed('Deutsch')).toBe(true);
    expect(screen.queryByLabelText('Search actions')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hands a row of the list to its caller, and closes', () => {
    const { onSelect, onClose } = show();
    openLanguage();

    key('ArrowDown');
    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fr' }),
      expect.objectContaining({ label: 'Choose' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters the list by what is typed into it, from an empty field', () => {
    show();
    type('lang');
    key('Enter');

    expect(field().value).toBe('');
    type('fr');

    expect(listed('Français')).toBe(true);
    expect(listed('Deutsch')).toBe(false);
  });

  it('keeps showing its list when its caller rebuilds the rows', () => {
    const { rerender } = show();
    openLanguage();

    rerender(structuredClone(ITEMS));

    expect(listed('Deutsch')).toBe(true);
  });
});

describe('going back out of a list', () => {
  it('happens on Escape, back on the row that was opened', () => {
    const { onSelect, onClose } = show();
    openLanguage();

    key('Escape');

    expect(listed('Home')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    key('Enter');
    expect(listed('Deutsch')).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('puts back what was typed before the list was opened', () => {
    show();
    type('lang');
    key('Enter');

    key('Escape');

    expect(field().value).toBe('lang');
  });

  it('happens on Backspace in an empty field, and not while something is typed', () => {
    show();
    openLanguage();
    type('d');

    key('Backspace');
    expect(listed('Deutsch')).toBe(true);
    type('');
    key('Backspace');

    expect(listed('Home')).toBe(true);
    expect(listed('Deutsch')).toBe(false);
  });

  it('happens when the way back is pressed', () => {
    show();
    openLanguage();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(listed('Home')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(field().placeholder).toBe('Search everything');
  });

  it('leaves Escape to close the palette once back at the top', () => {
    const { onClose } = show();
    openLanguage();

    key('Escape');
    key('Escape');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves Backspace to the field at the top', () => {
    show();

    expect(key('Backspace')).toBe(true);
  });
});
