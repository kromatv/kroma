// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { createInputTestHost } from '#ui/testing-input';
import type { SelectValueDetails } from './select-context';
import { Select, type SelectSingleRootProps } from './select.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Source(props: Readonly<Omit<SelectSingleRootProps, 'children'>>) {
  return (
    <Select.Root label="Source" {...props}>
      <Select.Trigger />
      <Select.Item value="all">Toutes les sources</Select.Item>
      <Select.Item value="server">kroma_server</Select.Item>
    </Select.Root>
  );
}

const trigger = () => screen.getByRole('combobox');

function pickSecond() {
  fireEvent.click(trigger());
  fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
  fireEvent.keyDown(trigger(), { key: 'Enter' });
}

const refuse = (_next: string, details: SelectValueDetails) => details.cancel();

const call = (...steps: { ref: string; action: string; args?: unknown[] }[]) => act({ steps });

describe('the value of a <Select>', () => {
  it('moves on a pick when the select runs itself', () => {
    render(<Source defaultValue="all" />);

    pickSecond();

    expect(trigger().getAttribute('aria-label')).toBe('Source: kroma_server');
  });

  it('asks a controlled caller and waits for the prop to move', () => {
    const onValueChange = vi.fn();
    render(<Source value="all" onValueChange={onValueChange} />);

    pickSecond();

    expect(onValueChange).toHaveBeenCalledWith('server', expect.anything());
    expect(trigger().getAttribute('aria-label')).toBe('Source: Toutes les sources');
  });

  it('tells the app the pick, its reason and the option it picked', () => {
    const onValueChange = vi.fn();
    render(<Source defaultValue="all" onValueChange={onValueChange} />);

    pickSecond();

    expect(onValueChange).toHaveBeenCalledWith(
      'server',
      expect.objectContaining({
        reason: 'select',
        source: 'user',
        item: expect.objectContaining({ value: 'server', label: 'kroma_server' }),
      }),
    );
  });

  it('keeps the value when the app cancels the pick, and still closes', () => {
    render(<Source defaultValue="all" onValueChange={refuse} />);

    pickSecond();

    expect(trigger().getAttribute('aria-label')).toBe('Source: Toutes les sources');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('tells nothing when the row picked is the value it holds', () => {
    const onValueChange = vi.fn();
    render(<Source defaultValue="all" onValueChange={onValueChange} />);

    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: 'Enter' });

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('a <Select> under a developer tool', () => {
  it('is listed with its state and its actions', () => {
    render(onScreen(<Source defaultValue="all" />));

    const [row] = snapshot();

    expect(row).toMatchObject({
      kind: 'select',
      state: { open: false },
      actions: ['setOpen', 'setValue', 'trigger', 'select'],
    });
  });

  it('picks through its select action, which closes the list as a pick does', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    const onValueChange = vi.fn();
    render(onScreen(<Source defaultValue="all" defaultOpen onValueChange={onValueChange} />));

    const report = await call({ ref: 'c1', action: 'select', args: ['server'] });

    expect(report.controls[0]?.state).toMatchObject({ open: false });
    expect(trigger().getAttribute('aria-label')).toBe('Source: kroma_server');
    expect(onValueChange).toHaveBeenCalledWith(
      'server',
      expect.objectContaining({ reason: 'select', source: 'tool' }),
    );
  });

  it('gives the option a setter moved, with the reason `set`', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    const onValueChange = vi.fn();
    render(onScreen(<Source defaultValue="all" onValueChange={onValueChange} />));

    await call({ ref: 'c1', action: 'setValue', args: [['server']] });

    expect(onValueChange).toHaveBeenCalledWith(
      'server',
      expect.objectContaining({
        reason: 'set',
        item: expect.objectContaining({ value: 'server' }),
      }),
    );
  });

  it('is refused while the select is disabled', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    render(onScreen(<Source defaultValue="all" disabled />));

    const report = await call({ ref: 'c1', action: 'select', args: ['server'] });

    expect(report.ok).toBe(false);
    expect(report.controls).toEqual([]);
  });
});
