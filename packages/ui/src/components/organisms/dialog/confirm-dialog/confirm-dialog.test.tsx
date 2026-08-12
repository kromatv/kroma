// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPressGuard } from '#ui/lib/press-guard';
import { ConfirmDialog } from './confirm-dialog';

afterEach(() => {
  cleanup();
  clearPressGuard();
});

describe('<ConfirmDialog>', () => {
  it('asks the question and answers through the pair it draws itself', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Supprimer le compte"
        description="Cette action est definitive."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        destructive
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText('Cette action est definitive.')).toBeTruthy();
    // Opening arms the guard that swallows the press which raised the panel;
    // this is the press after.
    clearPressGuard();
    fireEvent.click(screen.getByLabelText('Supprimer'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Annuler'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
