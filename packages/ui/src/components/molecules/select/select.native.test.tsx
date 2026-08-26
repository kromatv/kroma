// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureRemote } from '#ui/lib/focus-remote';
import { clearPressGuard } from '#ui/lib/press-guard';
import { setSurfacePresentation } from '#ui/lib/surface-presentation';
import { onScreen } from '#ui/testing';
import { Select } from './select';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
  setSurfacePresentation('auto');
});

function Source({ presentation }: Readonly<{ presentation?: 'auto' | 'panel' | 'dialog' }>) {
  return (
    <Select.Root label="Source" defaultValue="all" defaultOpen presentation={presentation}>
      <Select.Trigger />
      <Select.Item value="all">Toutes les sources</Select.Item>
      <Select.Item value="server">kroma_server</Select.Item>
    </Select.Root>
  );
}

describe('<Select> under Metro resolution', () => {
  it('draws the anchored listbox rather than only the dialog', () => {
    render(<Source presentation="panel" />);

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('takes the dialog from the shell without a prop at the call site', () => {
    setSurfacePresentation('dialog');

    render(<Source />);

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('still opens in a dialog wherever a spatial navigator drives', () => {
    render(onScreen(<Source />));

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('picks the option a press lands on in the anchored listbox', () => {
    render(<Source presentation="panel" />);
    clearPressGuard();

    fireEvent.click(screen.getAllByRole('option')[1] as HTMLElement);

    expect(screen.getByRole('combobox').getAttribute('aria-label')).toBe('Source: kroma_server');
  });
});
