// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { createInputTestHost } from '#ui/testing-input';
import { Menu, type MenuRootProps } from './menu.component';

const { clearPressGuard, render } = createInputTestHost();

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Actions(props: Readonly<Omit<MenuRootProps, 'children'>>) {
  return (
    <Menu.Root label="Row actions" {...props}>
      <Menu.Trigger />
      <Menu.Item icon="pencil">Renommer</Menu.Item>
    </Menu.Root>
  );
}

describe('the open state of a <Menu>', () => {
  it('opens on a press of the trigger when the menu runs itself', () => {
    render(<Actions />);

    fireEvent.click(screen.getByLabelText('Row actions'));

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  it('asks a controlled caller and waits for the prop to open', () => {
    const onOpenChange = vi.fn();
    render(<Actions open={false} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByLabelText('Row actions'));

    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: 'trigger', source: 'user' }),
    );
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('stays closed when the app cancels the change', () => {
    render(<Actions onOpenChange={(_, details) => details.cancel()} />);

    fireEvent.click(screen.getByLabelText('Row actions'));

    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});

describe('a <Menu> under a developer tool', () => {
  it('is listed with its state and its actions', () => {
    render(onScreen(<Actions />));

    const [row] = snapshot();

    expect(row).toMatchObject({
      kind: 'menu',
      state: { open: false },
      actions: ['setOpen', 'trigger'],
    });
  });

  it('opens through its trigger action, and the app hears the tool', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    const onOpenChange = vi.fn();
    render(onScreen(<Actions onOpenChange={onOpenChange} />));

    const report = await act({ steps: [{ ref: 'c1', action: 'trigger' }] });

    expect(report.controls[0]?.state).toEqual({ open: true });
    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: 'trigger', source: 'tool' }),
    );
  });

  it('closes through its setter with the reason `set`', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    const onOpenChange = vi.fn();
    render(onScreen(<Actions defaultOpen onOpenChange={onOpenChange} />));

    await act({ steps: [{ ref: 'c1', action: 'setOpen', args: [false] }] });

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.objectContaining({ reason: 'set' }));
  });
});
