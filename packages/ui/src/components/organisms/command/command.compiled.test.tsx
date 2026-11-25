// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetails } from '#ui/lib/control';
import { act, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { Command } from './command.component';
import { LIBRARY } from './command.fixtures';
import { flatten, sectionsOf } from './command-list';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
});

afterEach(cleanup);

type Palette = {
  query?: string;
  onQueryChange?: (next: string, details: ChangeDetails) => void;
};

function show(given: Palette = {}) {
  const onSelect = vi.fn();
  render(
    onScreen(
      <Command.Root items={LIBRARY} onSelect={onSelect} onClose={vi.fn()} {...given}>
        <Command.Input label="Search" />
        <Command.List />
      </Command.Root>,
    ),
  );
  return onSelect;
}

const type = (text: string) =>
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: text } });

const key = (name: string) => fireEvent.keyDown(document, { key: name });

const palette = () => snapshot().find((control) => control.kind === 'command');

const firstFor = (query: string) => flatten(sectionsOf(LIBRARY, query))[0];

describe('the query of a palette', () => {
  it('narrows the list as a reader types', () => {
    show();

    type('scan');

    expect(screen.queryByRole('button', { name: /Films/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Scan the folders/ })).toBeTruthy();
  });

  it('stays where it was when the app cancels the change', () => {
    show({ onQueryChange: (_next, details) => details.cancel() });

    type('scan');

    expect(screen.getByRole('button', { name: /Films/ })).toBeTruthy();
  });

  it('is read by a tool with the setter it takes', () => {
    show({ query: 'mus', onQueryChange: vi.fn() });

    const control = palette();

    expect(control).toMatchObject({
      name: 'Command.Root',
      kind: 'command',
      state: { query: 'mus' },
      actions: ['setQuery'],
    });
  });

  it('starts on the first row again when an earlier query comes back', () => {
    const onSelect = show();
    type('s');
    key('ArrowDown');

    type('sc');
    type('s');
    key('Enter');

    expect(onSelect).toHaveBeenCalledWith(firstFor('s'), undefined);
  });

  it('changes under a tool’s call and puts the cursor back on the first row', async () => {
    const onSelect = show();
    key('ArrowDown');
    key('ArrowDown');

    const ref = palette()?.ref ?? '';

    await act({ steps: [{ ref, action: 'setQuery', args: ['s'] }] });
    key('Enter');

    expect(palette()?.state).toEqual({ query: 's' });
    expect(onSelect).toHaveBeenCalledWith(firstFor('s'), undefined);
  });
});
