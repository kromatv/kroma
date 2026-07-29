// @vitest-environment jsdom
//
// A dialog on a television has to TAKE THE REMOTE, and the screen underneath has
// to give it up. That is the whole of this file, driven the way the TV shells
// drive it - key events on the document - so what is proved is the path a press
// actually takes rather than a prop being passed.
//
// The bug it pins down: a dialog's buttons used to join the spatial tree of the
// screen behind, which stayed live. The ring never moved into the panel (the
// screen already had a focus owner, so the dialog's entry point read as a late
// arrival), the D-pad walked out of the panel, and OK fired the control the
// dialog was covering.

import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { configureRemote } from '#ui/lib/focus-remote';
import { FocusScope } from '#ui/lib/focus-scope';
import { OverlayHost } from '#ui/lib/overlay-host';
import { clearPressGuard } from '#ui/lib/press-guard';
import { Dialog, DialogFooter } from './dialog';

beforeAll(() => configureRemote());

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const host = (label: string) => screen.getByLabelText(label);
/** True when this control is wearing the amber ring. `rendered: false` allows a
 * control that is not on screen at all (a dialog that has not opened yet). */
function lit(label: string, at: { rendered: boolean } = { rendered: true }): boolean {
  const el = at.rendered ? host(label) : screen.queryByLabelText(label);
  return el instanceof HTMLElement && el.style.boxShadow !== '';
}

/** One remote press, as the browser TV shells deliver it. */
function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/** A screen with two controls, and a dialog that may be over them. */
function Screen({ open, onConfirm }: Readonly<{ open: boolean; onConfirm?: () => void }>) {
  return (
    <FocusScope>
      <Focusable label="Derriere" autoFocus />
      <Focusable label="Voisin" />
      <Dialog open={open} title="Supprimer">
        <DialogFooter>
          <Focusable label="Annuler" />
          <Focusable label="Confirmer" autoFocus onPress={onConfirm} />
        </DialogFooter>
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

    // Left moves within the dialog's own row...
    press('ArrowLeft');
    expect(lit('Annuler')).toBe(true);
    expect(lit('Confirmer')).toBe(false);

    // ...and no press, in any direction, reaches the screen underneath. Its own
    // navigator is locked, so it never even sees the key.
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
          <DialogFooter>
            <Focusable label="Confirmer" autoFocus onPress={confirm} />
          </DialogFooter>
        </Dialog>
      </FocusScope>,
    );

    // The dialog arms the press guard on open, exactly so the OK that SUMMONED
    // it cannot carry into the action it auto-focuses. This is the press after.
    clearPressGuard();
    press('Enter');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(behind).not.toHaveBeenCalled();
  });

  it('renders through an <OverlayHost> instead of a modal when there is one', () => {
    // What a television does, and it is not cosmetic: RN's <Modal> is a separate
    // view controller whose remote handler never receives a press here, because
    // this app's focus is virtual and the system's focus engine has no reason to
    // move into it. See lib/overlay-host.
    const { container } = render(
      <OverlayHost>
        <FocusScope>
          <Focusable label="Derriere" autoFocus />
          <Dialog open title="Supprimer">
            <DialogFooter>
              <Focusable label="Annuler" />
              <Focusable label="Confirmer" autoFocus />
            </DialogFooter>
          </Dialog>
        </FocusScope>
      </OverlayHost>,
    );

    // The panel is up, and the trap still took the ring...
    expect(lit('Confirmer')).toBe(true);
    press('ArrowLeft');
    expect(lit('Annuler')).toBe(true);

    // ...IN the app's own tree. A <Modal> would have portalled it out of the
    // container entirely, which on a television is a view controller the remote
    // never reaches.
    const panel = document.querySelector('[data-focus-scope]');
    expect(panel).not.toBeNull();
    expect(container.contains(panel)).toBe(true);
  });

  it('keeps using a modal where no host is mounted (the web app, a phone)', () => {
    const { container } = render(
      <FocusScope>
        <Dialog open title="Supprimer">
          <DialogFooter>
            <Focusable label="Confirmer" autoFocus />
          </DialogFooter>
        </Dialog>
      </FocusScope>,
    );
    expect(lit('Confirmer')).toBe(true);
    // Out of the tree, in <Modal>'s own portal - unchanged for every app that
    // mounts no host.
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
            <DialogFooter>
              <Focusable label="Confirmer" autoFocus />
            </DialogFooter>
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
            <DialogFooter>
              <Focusable label="Confirmer" autoFocus />
            </DialogFooter>
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
    // The screen's ring stays parked on what it had - the navigator behind is
    // locked, not blurred, and it is under an 86% scrim while the dialog is up.
    // That is also what makes the return seamless: nothing to restore.
    expect(lit('Derriere')).toBe(true);

    view.rerender(<Screen open={false} />);
    // The screen's two controls are stacked, so Down is the move between them:
    // it lands, which is the lock having been released.
    press('ArrowDown');
    expect(lit('Voisin')).toBe(true);
    expect(lit('Derriere')).toBe(false);
  });
});
