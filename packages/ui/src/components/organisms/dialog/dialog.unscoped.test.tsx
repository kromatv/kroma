// @vitest-environment jsdom

// The browser app mounts no spatial navigator at all: it is a mouse-and-
// keyboard page, not a 10-foot screen. Every kit overlay still has to render
// there, so the focus GROUP a dialog carries (Dialog.Actions) degrades to a
// plain view instead of asking a navigator that does not exist.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Focusable } from '#ui/components/atoms/focusable';
import { FocusColumn, FocusRegion } from '#ui/lib/focus-scope';
import { clearPressGuard } from '#ui/lib/press-guard';
import { Dialog } from './dialog';

afterEach(cleanup);

// Opening a dialog arms the guard that stops the press which opened it from
// firing the control underneath; a test clicking straight away is past it.
function settled() {
  clearPressGuard();
}

describe('outside a focus scope', () => {
  it('renders a dialog whose actions are a focus group', () => {
    const onConfirm = vi.fn();
    render(
      <Dialog.Root open title="Supprimer le compte">
        <Dialog.Actions
          cancelLabel="Annuler"
          onCancel={() => {}}
          confirmLabel="Supprimer"
          onConfirm={onConfirm}
        />
      </Dialog.Root>,
    );
    expect(screen.getByText('Supprimer le compte')).toBeTruthy();
    settled();
    fireEvent.click(screen.getByLabelText('Supprimer'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders a row of its own controls, and they still press', () => {
    const onPress = vi.fn();
    render(
      <Dialog.Root open title="Titre">
        <Dialog.Actions>
          <Focusable label="Annuler" onPress={onPress} />
        </Dialog.Actions>
      </Dialog.Root>,
    );
    settled();
    fireEvent.click(screen.getByLabelText('Annuler'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the focus groups on their own, so any kit component holding one works', () => {
    render(
      <>
        <FocusRegion>
          <Focusable label="Rangee" />
        </FocusRegion>
        <FocusColumn>
          <Focusable label="Colonne" />
        </FocusColumn>
      </>,
    );
    expect(screen.getByLabelText('Rangee')).toBeTruthy();
    expect(screen.getByLabelText('Colonne')).toBeTruthy();
  });
});
