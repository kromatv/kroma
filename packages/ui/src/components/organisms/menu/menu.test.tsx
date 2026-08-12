// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
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

  it('fires the dialog row a press lands on, and closes first there too', () => {
    const order: string[] = [];
    render(
      <FocusScope>
        <Menu.Root
          label="Row actions"
          defaultOpen
          onOpenChange={(open, details) => order.push(`${open}:${details.reason}`)}
        >
          <Menu.Trigger />
          <Menu.Separator />
          <Menu.Item onSelect={() => order.push('select')}>Renommer</Menu.Item>
        </Menu.Root>
      </FocusScope>,
    );
    clearPressGuard();
    fireEvent.click(screen.getByText('Renommer'));
    expect(order).toEqual(['false:select', 'select']);
  });

  it('moves the active row under the pointer, so Enter fires what the mouse is on', () => {
    const onRemove = vi.fn();
    render(<Actions onRemove={onRemove} />);
    const trigger = screen.getByLabelText('Row actions');
    fireEvent.click(trigger);
    // The panel keeps DOM focus on the trigger, so the hovered row is named
    // rather than focused.
    fireEvent.pointerEnter(screen.getByLabelText('Supprimer'));
    expect(trigger.getAttribute('aria-activedescendant')).toBe(
      screen.getByLabelText('Supprimer').getAttribute('id'),
    );
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('types ahead to the row a printable key names', () => {
    const onRemove = vi.fn();
    render(<Actions onRemove={onRemove} />);
    const trigger = screen.getByLabelText('Row actions');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 's' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('reads a number child as the label, and leaves a written row alone', () => {
    render(
      <Menu.Root label="Piste">
        <Menu.Trigger />
        <Menu.Item onSelect={() => {}}>{1080}</Menu.Item>
        <Menu.Item label="Profil" onSelect={() => {}}>
          <Text>Max · 4K</Text>
        </Menu.Item>
      </Menu.Root>,
    );
    fireEvent.click(screen.getByLabelText('Piste'));
    expect(screen.getByLabelText('1080').textContent).toBe('1080');
    expect(screen.getByLabelText('Profil').textContent).toBe('Max · 4K');
  });

  it('leaves a composed row named by its own words rather than by nothing', () => {
    render(
      <Menu.Root label="Piste">
        <Menu.Trigger />
        <Menu.Item onSelect={() => {}}>
          <Text>Max · 4K</Text>
        </Menu.Item>
      </Menu.Root>,
    );
    fireEvent.click(screen.getByLabelText('Piste'));
    const row = screen.getByRole('menuitem');
    // An empty name would hide the words the row does draw.
    expect(row.getAttribute('aria-label')).toBeNull();
    expect(row.textContent).toBe('Max · 4K');
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

  it('refuses an item that is not a direct child of the Root', () => {
    expect(() => render(<Menu.Item onSelect={() => {}}>Renommer</Menu.Item>)).toThrow(
      '<Menu.Item> must be a direct child of <Menu.Root>',
    );
  });

  it('refuses a trigger outside a Root', () => {
    expect(() => render(<Menu.Trigger />)).toThrow(
      '<Menu.Trigger> must be used inside <Menu.Root>',
    );
  });
});
