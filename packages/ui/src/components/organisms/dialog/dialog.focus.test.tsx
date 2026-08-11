// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { OverlayHost } from '#ui/lib/overlay-host';
import { clearPressGuard } from '#ui/lib/press-guard';
import { Dialog } from './dialog';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const host = (label: string) => screen.getByLabelText(label);
// A control wears the focus ring as a box shadow.
function lit(label: string, at: { rendered: boolean } = { rendered: true }): boolean {
  const el = at.rendered ? host(label) : screen.queryByLabelText(label);
  return el instanceof HTMLElement && el.style.boxShadow !== '';
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
      <Dialog open={open} title="Supprimer">
        <Dialog.Actions>
          <Focusable label="Annuler" />
          <Focusable label="Confirmer" autoFocus onPress={onConfirm} />
        </Dialog.Actions>
      </Dialog>
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
        <Dialog open title="Supprimer">
          <Dialog.Actions>
            <Focusable label="Confirmer" autoFocus onPress={confirm} />
          </Dialog.Actions>
        </Dialog>
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
          <Dialog open title="Supprimer">
            <Dialog.Actions>
              <Focusable label="Annuler" />
              <Focusable label="Confirmer" autoFocus />
            </Dialog.Actions>
          </Dialog>
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
        <Dialog open title="Supprimer">
          <Dialog.Actions>
            <Focusable label="Confirmer" autoFocus />
          </Dialog.Actions>
        </Dialog>
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
          <Dialog open title="Supprimer">
            <Dialog.Actions>
              <Focusable label="Confirmer" autoFocus />
            </Dialog.Actions>
          </Dialog>
        </FocusScope>
      </OverlayHost>,
    );
    expect(screen.getByLabelText('Confirmer')).toBeDefined();

    view.rerender(
      <OverlayHost>
        <FocusScope>
          <Focusable label="Derriere" autoFocus />
          <Dialog open={false} title="Supprimer">
            <Dialog.Actions>
              <Focusable label="Confirmer" autoFocus />
            </Dialog.Actions>
          </Dialog>
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
