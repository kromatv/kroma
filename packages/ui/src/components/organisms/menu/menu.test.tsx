// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { clearPressGuard } from '#ui/lib/press-guard';
import { Menu } from './menu';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function Actions({
  onRename = () => {},
  onRemove = () => {},
  onOpenChange,
}: Readonly<{
  onRename?: () => void;
  onRemove?: () => void;
  onOpenChange?: (open: boolean, details: { reason: string }) => void;
}>) {
  return (
    <Menu.Root label="Row actions" onOpenChange={onOpenChange}>
      <Menu.Trigger />
      <Menu.Item icon="pencil" onSelect={onRename}>
        Renommer
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item icon="trash" tone="danger" onSelect={onRemove}>
        Supprimer
      </Menu.Item>
    </Menu.Root>
  );
}

describe('<Menu>', () => {
  it('names the trigger from the Root and opens an aria menu', () => {
    render(<Actions />);
    const trigger = screen.getByLabelText('Row actions');
    fireEvent.click(trigger);
    const panel = screen.getByRole('menu');
    expect(trigger.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('fires the item the keyboard lands on, and closes first', () => {
    const order: string[] = [];
    render(
      <Actions
        onRemove={() => order.push('select')}
        onOpenChange={(open, details) => order.push(`${open}:${details.reason}`)}
      />,
    );
    const trigger = screen.getByLabelText('Row actions');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(order).toEqual(['true:trigger', 'false:select', 'select']);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('fires the item a pointer presses', () => {
    const onRename = vi.fn();
    render(<Actions onRename={onRename} />);
    fireEvent.click(screen.getByLabelText('Row actions'));
    fireEvent.click(screen.getByText('Renommer'));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('reports Escape and a press outside with their reasons', () => {
    const onOpenChange = vi.fn();
    render(<Actions onOpenChange={onOpenChange} />);
    const trigger = screen.getByLabelText('Row actions');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { reason: 'escape' });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByLabelText('Fermer'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { reason: 'outside' });
  });

  it('opens in a dialog under a D-pad, and Back says so', () => {
    const onOpenChange = vi.fn();
    render(
      <FocusScope>
        <Menu.Root label="Row actions" defaultOpen onOpenChange={onOpenChange}>
          <Menu.Trigger />
          <Menu.Item onSelect={() => {}}>Renommer</Menu.Item>
          <Menu.Separator />
          <Menu.Item tone="danger" onSelect={() => {}}>
            Supprimer
          </Menu.Item>
        </Menu.Root>
      </FocusScope>,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false, { reason: 'back' });
  });

  it('takes a trigger the caller owns, through render', () => {
    render(
      <Menu.Root label="Account">
        <Menu.Trigger
          render={(bind) => (
            <button type="button" ref={bind.ref as never} onClick={bind.onPress}>
              Max
            </button>
          )}
        />
        <Menu.Item onSelect={() => {}}>Se deconnecter</Menu.Item>
      </Menu.Root>,
    );
    fireEvent.click(screen.getByText('Max'));
    expect(screen.getByRole('menu')).toBeTruthy();
  });
});
