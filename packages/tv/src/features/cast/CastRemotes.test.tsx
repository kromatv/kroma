// @vitest-environment jsdom

import type { CastController, KromaClient } from '@kroma/core';
import { clearPressGuard } from '@kroma/ui/kit';
import { onScreen } from '@kroma/ui/testing';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Connection, ConnectionProvider } from '#tv/app/providers/connection';
import { CastRemotes } from '#tv/features/cast/CastRemotes';
import { setCastControllers, setCastUplink } from '#tv/features/cast/controllers';

const phone = (id: string, username: string, name: string): CastController => ({
  id,
  username,
  name,
  avatarUrl: null,
});

const client = { resolveArt: () => null } as unknown as KromaClient;

function show() {
  return render(
    onScreen(
      <ConnectionProvider value={{ client } as Connection}>
        <CastRemotes />
      </ConnectionProvider>,
    ),
  );
}

function openPanel() {
  fireEvent.click(screen.getByLabelText('Remotes'));
  // The dialog arms the press guard as it mounts, and would otherwise swallow
  // the test's next press.
  clearPressGuard();
}

const uplink = vi.fn();

beforeEach(() => {
  uplink.mockClear();
  // Module state outlives a test; setting the uplink to null also empties the
  // roster.
  setCastUplink(null);
  setCastUplink(uplink);
});

afterEach(() => {
  cleanup();
  clearPressGuard();
});

describe('CastRemotes', () => {
  it('draws nothing while no remote is driving this television', () => {
    show();
    expect(screen.queryByLabelText('Remotes')).toBeNull();
  });

  it('counts the remotes on the chip and names them behind it', () => {
    setCastControllers([phone('c1', 'max', 'iPhone'), phone('c2', 'lea', 'Pixel')]);
    show();

    expect(screen.getByText('2')).toBeTruthy();
    openPanel();
    expect(screen.getByText('iPhone')).toBeTruthy();
    expect(screen.getByText('Pixel')).toBeTruthy();
  });

  it('hangs up on the remote whose row is pressed', () => {
    setCastControllers([phone('c1', 'max', 'iPhone')]);
    show();
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: /max/ }));
    expect(uplink).toHaveBeenCalledWith({ type: 'cast.kick', controllerId: 'c1' });
  });

  it('closes on the panel’s own button', () => {
    setCastControllers([phone('c1', 'max', 'iPhone')]);
    show();
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('iPhone')).toBeNull();
  });

  it('closes on Back', () => {
    setCastControllers([phone('c1', 'max', 'iPhone')]);
    show();
    openPanel();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('iPhone')).toBeNull();
  });

  // The chip that opened the panel goes with the last remote, so an open panel
  // would have nothing left to hand focus back to.
  it('closes itself when the last remote leaves', () => {
    setCastControllers([phone('c1', 'max', 'iPhone')]);
    show();
    openPanel();

    act(() => {
      setCastControllers([]);
    });
    expect(screen.queryByText('iPhone')).toBeNull();
    expect(screen.queryByLabelText('Remotes')).toBeNull();
  });
});
