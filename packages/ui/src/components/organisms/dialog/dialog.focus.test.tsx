// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { TextInput } from 'react-native';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { OverlayHost } from '#ui/lib/overlay-host';
import { clearPressGuard } from '#ui/lib/press-guard';
import { wearsRing } from '#ui/testing';
import { Dialog } from './dialog';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const host = (label: string) => screen.getByLabelText(label);
function lit(label: string, at: { rendered: boolean } = { rendered: true }): boolean {
  return wearsRing(at.rendered ? host(label) : screen.queryByLabelText(label));
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function Screen({ open, onConfirm }: Readonly<{ open: boolean; onConfirm?: () => void }>) {
  return (
    <FocusScope>
      <Focusable label="Derriere" autoFocus />
      <Focusable label="Voisin" />
      <Dialog.Root open={open} title="Supprimer">
        <Dialog.Actions>
          <Focusable label="Annuler" />
          <Focusable label="Confirmer" autoFocus onPress={onConfirm} />
        </Dialog.Actions>
      </Dialog.Root>
    </FocusScope>
  );
}

describe('a dialog over a navigated screen', () => {
  it('opens the ring on its own default action', () => {
    const view = render(<Screen open={false} />);
    expect(lit('Derriere')).toBe(true);
    expect(lit('Confirmer', { rendered: false })).toBe(false);

    view.rerender(<Screen open />);
    expect(lit('Confirmer')).toBe(true);
  });

  it('keeps the D-pad inside the panel', () => {
    render(<Screen open />);
    expect(lit('Confirmer')).toBe(true);

    press('ArrowLeft');
    expect(lit('Annuler')).toBe(true);
    expect(lit('Confirmer')).toBe(false);

    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowUp']) press(key);
    expect(lit('Voisin')).toBe(false);
    expect(lit('Annuler') || lit('Confirmer')).toBe(true);
  });

  it('fires the dialog action on OK, never the button it is covering', () => {
    const behind = vi.fn();
    const confirm = vi.fn();
    render(
      <FocusScope>
        <Focusable label="Derriere" autoFocus onPress={behind} />
        <Dialog.Root open title="Supprimer">
          <Dialog.Actions>
            <Focusable label="Confirmer" autoFocus onPress={confirm} />
          </Dialog.Actions>
        </Dialog.Root>
      </FocusScope>,
    );

    // The dialog arms the press guard on open so the OK that summoned it cannot
    // carry into the action it auto-focuses; this is the press after.
    clearPressGuard();
    press('Enter');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(behind).not.toHaveBeenCalled();
  });

  it('renders through an <OverlayHost> instead of a modal when there is one', () => {
    // RN's <Modal> is a separate view controller whose remote handler never
    // receives a press here: this app's focus is virtual, so the system focus
    // engine has no reason to move into it.
    const { container } = render(
      <OverlayHost>
        <FocusScope>
          <Focusable label="Derriere" autoFocus />
          <Dialog.Root open title="Supprimer">
            <Dialog.Actions>
              <Focusable label="Annuler" />
              <Focusable label="Confirmer" autoFocus />
            </Dialog.Actions>
          </Dialog.Root>
        </FocusScope>
      </OverlayHost>,
    );

    expect(lit('Confirmer')).toBe(true);
    press('ArrowLeft');
    expect(lit('Annuler')).toBe(true);

    const panel = document.querySelector('[data-focus-scope]');
    expect(panel).not.toBeNull();
    expect(container.contains(panel)).toBe(true);
  });

  it('keeps using a modal where no host is mounted (the web app, a phone)', () => {
    const { container } = render(
      <FocusScope>
        <Dialog.Root open title="Supprimer">
          <Dialog.Actions>
            <Focusable label="Confirmer" autoFocus />
          </Dialog.Actions>
        </Dialog.Root>
      </FocusScope>,
    );
    expect(lit('Confirmer')).toBe(true);
    const panel = document.querySelector('[data-focus-scope]');
    expect(panel).not.toBeNull();
    expect(container.contains(panel)).toBe(false);
  });

  it('takes the panel down with the dialog', () => {
    const view = render(
      <OverlayHost>
        <FocusScope>
          <Focusable label="Derriere" autoFocus />
          <Dialog.Root open title="Supprimer">
            <Dialog.Actions>
              <Focusable label="Confirmer" autoFocus />
            </Dialog.Actions>
          </Dialog.Root>
        </FocusScope>
      </OverlayHost>,
    );
    expect(screen.getByLabelText('Confirmer')).toBeDefined();

    view.rerender(
      <OverlayHost>
        <FocusScope>
          <Focusable label="Derriere" autoFocus />
          <Dialog.Root open={false} title="Supprimer">
            <Dialog.Actions>
              <Focusable label="Confirmer" autoFocus />
            </Dialog.Actions>
          </Dialog.Root>
        </FocusScope>
      </OverlayHost>,
    );
    expect(screen.queryByLabelText('Confirmer')).toBeNull();
    expect(screen.queryByText('Supprimer')).toBeNull();
  });

  it('gives the remote back, where it left it, when it closes', () => {
    const view = render(<Screen open />);
    expect(lit('Confirmer')).toBe(true);
    // The navigator behind is locked, not blurred, so its ring stays parked.
    expect(lit('Derriere')).toBe(true);

    view.rerender(<Screen open={false} />);
    // The screen's two controls are stacked: Down landing is the lock released.
    press('ArrowDown');
    expect(lit('Voisin')).toBe(true);
    expect(lit('Derriere')).toBe(false);
  });
});

function opener(): HTMLButtonElement {
  const button = document.createElement('button');
  document.body.append(button);
  button.focus();
  return button;
}

describe('where a dialog opens the keyboard on a browser', () => {
  it('opens on the first control, never on the panel that scrolls', () => {
    opener();

    render(
      <Dialog.Root open title="Modifier">
        <Focusable label="Annuler" onPress={() => {}} />
        <Focusable label="Confirmer" onPress={() => {}} />
      </Dialog.Root>,
    );

    expect(document.activeElement).toBe(screen.getByLabelText('Annuler'));
  });

  it('takes the focus itself where it holds no control, so its title is read', () => {
    opener();

    render(
      <Dialog.Root open title="Patientez">
        <Focusable label="Rien" disabled />
      </Dialog.Root>,
    );

    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Patientez' }));
  });

  it('hands the focus on when the panel itself claims it', () => {
    opener();
    const view = render(
      <Dialog.Root open title="Modifier">
        <Focusable label="Annuler" onPress={() => {}} />
      </Dialog.Root>,
    );
    const panel = screen.getByRole('dialog', { name: 'Modifier' }).querySelector('div');

    act(() => {
      panel?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(document.activeElement).toBe(screen.getByLabelText('Annuler'));
    view.unmount();
  });

  it('hands the focus back to whatever opened it', () => {
    const trigger = opener();

    const view = render(
      <Dialog.Root open title="Modifier">
        <Focusable label="Annuler" onPress={() => {}} />
      </Dialog.Root>,
    );
    view.unmount();

    expect(document.activeElement).toBe(trigger);
  });

  it('leaves content that already claimed the focus where it is', () => {
    opener();

    render(
      <Dialog.Root open title="Chercher">
        <Focusable label="Annuler" onPress={() => {}} />
        <TextInput accessibilityLabel="Titre" autoFocus />
      </Dialog.Root>,
    );

    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });
});
