// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '#ui/components/atoms/button';
import { clearPressGuard } from '#ui/lib/press-guard';
import { Dialog } from './dialog';

afterEach(() => {
  cleanup();
  clearPressGuard();
});

const control = (label: string) => screen.getByLabelText(label);
const fill = (label: string) => getComputedStyle(control(label)).backgroundColor;

describe('Dialog.Actions', () => {
  it('is a part of the dialog, and the one name for a row of its controls', () => {
    expect(Object.keys(Dialog).sort()).toEqual(['Actions', 'Footer', 'Header', 'Panel', 'Root']);
  });

  it('writes cancel and confirm from the sugar', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <Dialog.Actions
        cancelLabel="Annuler"
        onCancel={onCancel}
        confirmLabel="Enregistrer"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(control('Annuler'));
    fireEvent.click(control('Enregistrer'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('turns the confirm red without demoting it to a third action', () => {
    const { unmount } = render(
      <Dialog.Actions
        cancelLabel="Annuler"
        onCancel={vi.fn()}
        confirmLabel="Supprimer"
        onConfirm={vi.fn()}
      />,
    );
    const accent = fill('Supprimer');
    unmount();

    render(
      <Dialog.Actions
        cancelLabel="Annuler"
        onCancel={vi.fn()}
        confirmLabel="Supprimer"
        onConfirm={vi.fn()}
        destructive
      />,
    );
    expect(fill('Supprimer')).not.toBe(accent);
    expect(control('Annuler')).toBeTruthy();
  });

  it('draws the way out on its own, so a panel with nothing to confirm grows no confirm', () => {
    const onCancel = vi.fn();
    const { container } = render(<Dialog.Actions cancelLabel="Fermer" onCancel={onCancel} />);
    expect((container.firstElementChild as HTMLElement).children).toHaveLength(1);
    fireEvent.click(control('Fermer'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('draws nothing at all when it was handed nothing to draw', () => {
    const { container } = render(<Dialog.Actions />);
    expect(container.firstElementChild).toBeNull();
  });

  it('is the row itself when it is given nothing but controls', () => {
    const onPress = vi.fn();
    render(
      <Dialog.Actions>
        <Button label="Fermer" onPress={onPress} />
      </Dialog.Actions>,
    );
    fireEvent.click(control('Fermer'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps an extra action at the edge opposite the pair', () => {
    const { container } = render(
      <Dialog.Actions
        cancelLabel="Annuler"
        onCancel={vi.fn()}
        confirmLabel="Enregistrer"
        onConfirm={vi.fn()}
      >
        <Button variant="dangerGhost" label="Supprimer le compte" onPress={vi.fn()} />
      </Dialog.Actions>,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(row).justifyContent).toBe('space-between');
    expect(row.children).toHaveLength(2);
    expect(row.children[0]?.textContent).toBe('Supprimer le compte');
    expect(row.children[1]?.textContent).toBe('AnnulerEnregistrer');
  });

  it('right-aligns the pair when nothing sits beside it', () => {
    const { container } = render(
      <Dialog.Actions
        cancelLabel="Annuler"
        onCancel={vi.fn()}
        confirmLabel="Enregistrer"
        onConfirm={vi.fn()}
      />,
    );
    expect(getComputedStyle(container.firstElementChild as HTMLElement).justifyContent).toBe(
      'flex-end',
    );
  });

  it('locks the confirm while the work runs, and leaves the way out open when it cannot be taken', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const view = render(
      <Dialog.Actions
        cancelLabel="Annuler"
        onCancel={onCancel}
        confirmLabel="Enregistrer"
        onConfirm={onConfirm}
        busy
      />,
    );
    fireEvent.click(control('Enregistrer'));
    expect(onConfirm).not.toHaveBeenCalled();

    view.rerender(
      <Dialog.Actions
        cancelLabel="Annuler"
        onCancel={onCancel}
        confirmLabel="Enregistrer"
        onConfirm={onConfirm}
        disabled
      />,
    );
    fireEvent.click(control('Enregistrer'));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(control('Annuler'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('sits inside the footer shelf, which lays out nothing of its own', () => {
    const { container } = render(
      <Dialog.Footer>
        <Dialog.Actions>
          <Button label="Fermer" onPress={vi.fn()} />
        </Dialog.Actions>
      </Dialog.Footer>,
    );
    const shelf = container.firstElementChild as HTMLElement;
    expect(getComputedStyle(shelf).flexDirection).not.toBe('row');
    expect(getComputedStyle(shelf.firstElementChild as HTMLElement).justifyContent).toBe(
      'flex-end',
    );
  });
});
