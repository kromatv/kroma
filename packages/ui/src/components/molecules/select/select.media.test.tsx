// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Avatar } from '#ui/components/atoms/avatar';
import { configureRemote } from '#ui/lib/focus-remote';
import { clearPressGuard } from '#ui/lib/press-guard';
import { Select, type SelectPresentation } from './select';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Members({ presentation = 'panel' }: Readonly<{ presentation?: SelectPresentation }>) {
  return (
    <Select.Root label="Membre" defaultValue="ada" presentation={presentation} defaultOpen>
      <Select.Trigger />
      <Select.Item value="everyone" label="Tous les membres" icon="users" />
      <Select.Item value="ada" label="Ada Lovelace" note="12 titres">
        <Select.Media>
          <Avatar name="Ada Lovelace" size={18} circle shadow={false} />
        </Select.Media>
      </Select.Item>
      <Select.Item value="grace" label="Grace Hopper" icon="users">
        <Select.Media>
          <Avatar name="Grace Hopper" size={18} circle shadow={false} />
        </Select.Media>
      </Select.Item>
    </Select.Root>
  );
}

describe('a <Select> whose options are people', () => {
  it('gives a row the face of the person it stands for', () => {
    render(<Members />);

    const row = screen.getByRole('option', { name: 'Ada Lovelace' });

    expect(within(row).getByText('AL')).toBeTruthy();
  });

  it('wears the picked face in the trigger as well as in the row', () => {
    render(<Members />);

    const trigger = screen.getByRole('combobox');

    expect(within(trigger).getByText('AL')).toBeTruthy();
    expect(trigger.getAttribute('aria-label')).toBe('Membre: Ada Lovelace');
  });

  it('keeps the label and the note a written face sits beside', () => {
    render(<Members />);

    const row = screen.getByRole('option', { name: 'Ada Lovelace' });

    expect(within(row).getByText('Ada Lovelace')).toBeTruthy();
    expect(within(row).getByText('12 titres')).toBeTruthy();
  });

  it('draws the written face rather than the glyph where a row carries both', () => {
    render(<Members />);

    const row = screen.getByRole('option', { name: 'Grace Hopper' });

    expect(within(row).getByText('GH')).toBeTruthy();
  });

  it('carries the same face into the dialog a D-pad opens', () => {
    render(<Members presentation="dialog" />);

    const row = screen.getByRole('option', { name: 'Ada Lovelace' });

    expect(within(row).getByText('AL')).toBeTruthy();
    expect(within(screen.getByRole('combobox')).getByText('AL')).toBeTruthy();
  });
});
