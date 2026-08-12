// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPressGuard } from '#ui/lib/press-guard';
import { Drawer } from './drawer';

afterEach(() => {
  cleanup();
  clearPressGuard();
});

function scrollerOver(label: string): HTMLElement | null {
  let node = screen.getByText(label).parentElement;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

describe('the default header', () => {
  it('draws the title, and only the panel scrolls', () => {
    render(
      <Drawer.Root open onClose={() => {}} title="Registres">
        <Text>Officiel</Text>
        <Drawer.Footer>
          <Text>Enregistrer</Text>
        </Drawer.Footer>
      </Drawer.Root>,
    );
    expect(screen.getByText('Registres')).toBeTruthy();
    expect(screen.getByText('Enregistrer')).toBeTruthy();
    // The one band that scrolls, and it scrolls without the caller writing a
    // pane of its own: the whole point of the compound API.
    expect(scrollerOver('Officiel')).not.toBeNull();
    expect(scrollerOver('Registres')).toBeNull();
    expect(scrollerOver('Enregistrer')).toBeNull();
  });

  it('offers a way out that calls onClose', () => {
    const onClose = vi.fn();
    render(
      <Drawer.Root open onClose={onClose} title="Notifications">
        <Text>Rien</Text>
      </Drawer.Root>,
    );
    // Opening the sheet arms the guard that stops the press which opened it
    // from carrying into it; this is the press after.
    clearPressGuard();
    fireEvent.click(within(screen.getByLabelText('Notifications')).getByLabelText('Fermer'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('draws no way out when the sheet cannot be dismissed', () => {
    render(
      <Drawer.Root open title="Notifications">
        <Text>Rien</Text>
      </Drawer.Root>,
    );
    expect(within(screen.getByLabelText('Notifications')).queryByLabelText('Fermer')).toBeNull();
  });
});

describe('the parts', () => {
  it('replace the bands the Root would have drawn', () => {
    render(
      <Drawer.Root open onClose={() => {}} title="Signalement">
        <Drawer.Header>
          <Text>Le titre du signalement</Text>
        </Drawer.Header>
        <Drawer.Panel>
          <Text>Le message</Text>
        </Drawer.Panel>
        <Drawer.Footer>
          <Text>Resoudre</Text>
        </Drawer.Footer>
      </Drawer.Root>,
    );
    expect(screen.getByText('Le titre du signalement')).toBeTruthy();
    expect(screen.queryByText('Signalement')).toBeNull();
    expect(scrollerOver('Le message')).not.toBeNull();
    expect(scrollerOver('Le titre du signalement')).toBeNull();
    expect(scrollerOver('Resoudre')).toBeNull();
  });

  it('keep the way out in a header of their own, without rewiring onClose', () => {
    const onClose = vi.fn();
    render(
      <Drawer.Root open onClose={onClose} title="Signalement">
        <Drawer.Header>
          <Text>Le titre du signalement</Text>
          <Drawer.Close />
        </Drawer.Header>
        <Drawer.Panel>
          <Text>Le message</Text>
        </Drawer.Panel>
      </Drawer.Root>,
    );
    clearPressGuard();
    fireEvent.click(within(screen.getByLabelText('Signalement')).getByLabelText('Fermer'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('draw no way out in a sheet that cannot be dismissed', () => {
    render(
      <Drawer.Root open title="Signalement">
        <Drawer.Header>
          <Text>Le titre du signalement</Text>
          <Drawer.Close />
        </Drawer.Header>
      </Drawer.Root>,
    );
    expect(screen.queryByLabelText('Fermer')).toBeNull();
  });

  it("names the sheet from `title` even when the header is the caller's", () => {
    render(
      <Drawer.Root open onClose={() => {}} title="Signalement">
        <Drawer.Header>
          <Text>Le titre du signalement</Text>
        </Drawer.Header>
        <Drawer.Panel>
          <Text>Le message</Text>
        </Drawer.Panel>
      </Drawer.Root>,
    );
    expect(screen.getByLabelText('Signalement').getAttribute('role')).toBe('dialog');
  });
});

describe('the exit', () => {
  it('keeps the sheet mounted while the slide plays, then takes it down', () => {
    vi.useFakeTimers();
    try {
      const view = render(
        <Drawer.Root open title="Notifications">
          <Text>Rien</Text>
        </Drawer.Root>,
      );
      expect(screen.getByText('Rien')).toBeTruthy();

      view.rerender(
        <Drawer.Root open={false} title="Notifications">
          <Text>Rien</Text>
        </Drawer.Root>,
      );
      expect(screen.getByText('Rien')).toBeTruthy();

      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByText('Rien')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
