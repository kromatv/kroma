// @vitest-environment jsdom

import { type CastController, ControllerId } from '@kromatv/client/cast';
import { fakeClient } from '@kromatv/client/test';
import { clearPressGuard } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Connection, ConnectionProvider } from '#tv/app/providers/connection';
import { CastRemotes } from '#tv/features/cast/CastRemotes';
import {
  CastControllerStoreProvider,
  createCastControllerStore,
} from '#tv/features/cast/controllers';

const phone = (id: string, username: string, name: string): CastController => ({
  id: ControllerId.parse(id),
  username,
  name,
  avatarUrl: null,
});

const client = fakeClient({ media: { artwork: { resolve: () => null } } });

function show(store: ReturnType<typeof createCastControllerStore>) {
  return render(
    onScreen(
      <ConnectionProvider value={{ client } as Connection}>
        <CastControllerStoreProvider value={store}>
          <CastRemotes />
        </CastControllerStoreProvider>
      </ConnectionProvider>,
    ),
  );
}

function openPanel() {
  fireEvent.click(screen.getByLabelText(/^Remotes/));
  // The dialog arms the press guard as it mounts, and would otherwise swallow
  // the test's next press.
  clearPressGuard();
}

const uplink = vi.fn();

beforeEach(() => {
  uplink.mockClear();
});

afterEach(() => {
  cleanup();
  clearPressGuard();
});

describe('CastRemotes', () => {
  it('draws nothing while no remote is driving this television', () => {
    const store = createCastControllerStore();
    store.setCastUplink(uplink);
    show(store);
    expect(screen.queryByLabelText('Remotes')).toBeNull();
  });

  it('counts the remotes on the chip and names them behind it', () => {
    const store = createCastControllerStore();
    store.setCastUplink(uplink);
    store.setCastControllers([phone('c1', 'max', 'iPhone'), phone('c2', 'lea', 'Pixel')]);
    show(store);

    expect(screen.getByText('2')).toBeTruthy();
    // The count is drawn INSIDE the chip, which is one control with one name,
    // so the name has to carry it too - as something meant to be heard rather
    // than a bracket a screen reader announces as punctuation.
    expect(screen.getByLabelText('Remotes, 2').getAttribute('aria-expanded')).toBe('false');
    openPanel();
    expect(screen.getByText('iPhone')).toBeTruthy();
    expect(screen.getByText('Pixel')).toBeTruthy();
  });

  it('hangs up on the remote whose row is pressed', () => {
    const store = createCastControllerStore();
    store.setCastUplink(uplink);
    store.setCastControllers([phone('c1', 'max', 'iPhone')]);
    show(store);
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: /max/ }));
    expect(uplink).toHaveBeenCalledWith({ type: 'cast.kick', controllerId: 'c1' });
  });

  it('closes on the panel’s own button', () => {
    const store = createCastControllerStore();
    store.setCastUplink(uplink);
    store.setCastControllers([phone('c1', 'max', 'iPhone')]);
    show(store);
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('iPhone')).toBeNull();
  });

  it('closes on Back', () => {
    const store = createCastControllerStore();
    store.setCastUplink(uplink);
    store.setCastControllers([phone('c1', 'max', 'iPhone')]);
    show(store);
    openPanel();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('iPhone')).toBeNull();
  });

  // The chip that opened the panel goes with the last remote, so an open panel
  // would have nothing left to hand focus back to.
  it('closes itself when the last remote leaves', () => {
    const store = createCastControllerStore();
    store.setCastUplink(uplink);
    store.setCastControllers([phone('c1', 'max', 'iPhone')]);
    show(store);
    openPanel();

    act(() => {
      store.setCastControllers([]);
    });
    expect(screen.queryByText('iPhone')).toBeNull();
    expect(screen.queryByLabelText('Remotes')).toBeNull();
  });
});
