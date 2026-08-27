// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureRemote } from '#ui/lib/focus-remote';
import { clearPressGuard } from '#ui/lib/press-guard';
import { Select, type SelectValueDetails } from './select';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Statuses({
  picked = ['active'],
  onValueChange,
}: Readonly<{
  picked?: readonly string[];
  onValueChange?: (next: string[], details: SelectValueDetails) => void;
}>) {
  return (
    <Select.Root
      multiple
      label="Statut"
      defaultValue={picked}
      presentation="panel"
      defaultOpen
      onValueChange={onValueChange}
    >
      <Select.Trigger />
      <Select.Item value="active">En cours</Select.Item>
      <Select.Item value="done">Terminés</Select.Item>
      <Select.Item value="failed">Échecs</Select.Item>
    </Select.Root>
  );
}

function trigger(): string | null {
  return screen.getByRole('combobox').getAttribute('aria-label');
}

function option(name: string): HTMLElement {
  return screen.getByRole('option', { name });
}

describe('a <Select> that takes several values', () => {
  it('adds a value to the picks and stays open for the next one', () => {
    render(<Statuses />);
    clearPressGuard();

    fireEvent.click(option('Terminés'));

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(trigger()).toBe('Statut: En cours, Terminés');
  });

  it('drops a value that is picked a second time', () => {
    render(<Statuses />);
    clearPressGuard();

    fireEvent.click(option('En cours'));

    expect(trigger()).toBe('Statut');
  });

  it('hands its handler the whole list, not only the value that moved', () => {
    const onValueChange = vi.fn();
    render(<Statuses onValueChange={onValueChange} />);
    clearPressGuard();

    fireEvent.click(option('Terminés'));

    expect(onValueChange).toHaveBeenCalledWith(['active', 'done'], {
      item: expect.objectContaining({ value: 'done', label: 'Terminés' }),
    });
  });

  it('takes the keyboard back from a row a pointer pressed, since the list outlives it', () => {
    render(<Statuses />);
    clearPressGuard();
    const row = option('Terminés');

    row.focus();
    fireEvent.click(row);

    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  it('announces the listbox as one several rows can be chosen from', () => {
    render(<Statuses />);

    expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBe('true');
  });

  it('counts the picks the trigger has no room to name', () => {
    render(<Statuses picked={['active', 'done', 'failed']} />);

    expect(screen.getByText('+2')).toBeTruthy();
    expect(trigger()).toBe('Statut: En cours, Terminés, Échecs');
  });

  it('keeps the dialog a remote drives open as rows are ticked', () => {
    render(
      <Select.Root
        multiple
        label="Statut"
        defaultValue={['active']}
        presentation="dialog"
        defaultOpen
      >
        <Select.Trigger />
        <Select.Item value="active">En cours</Select.Item>
        <Select.Item value="done">Terminés</Select.Item>
      </Select.Root>,
    );
    clearPressGuard();

    fireEvent.click(option('Terminés'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(trigger()).toBe('Statut: En cours, Terminés');
  });

  it('closes on the first pick when only one value is allowed', () => {
    render(
      <Select.Root label="Statut" defaultValue="active" presentation="panel" defaultOpen>
        <Select.Trigger />
        <Select.Item value="active">En cours</Select.Item>
        <Select.Item value="done">Terminés</Select.Item>
      </Select.Root>,
    );
    clearPressGuard();

    fireEvent.click(option('Terminés'));

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger()).toBe('Statut: Terminés');
  });
});
