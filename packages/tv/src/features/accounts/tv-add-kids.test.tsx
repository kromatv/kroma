// @vitest-environment jsdom

import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { TvAddKids } from './tv-add-kids.component';

interface Mocks {
  createKids: Mock;
  switchProfile: Mock;
  user: { hasPin: boolean };
}

const mocks: Mocks = vi.hoisted(() => ({
  createKids: vi.fn(),
  switchProfile: vi.fn(),
  user: { hasPin: true },
}));

vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: mocks.user, switchProfile: mocks.switchProfile }),
}));
vi.mock('#tv/app/providers/env', () => ({ useEnv: () => ({ physicalKeyboard: true }) }));
vi.mock('#tv/app/router', () => ({
  useClient: () => ({ admin: { createKids: mocks.createKids } }),
  useNav: () => ({ back: vi.fn(), go: vi.fn(), route: { name: 'addKids' } }),
}));
vi.mock('./settings/pin-panel.component', () => ({ PinPanel: () => <div>pin panel</div> }));

const { render, clearPressGuard } = createInputTestHost();

function press(name: RegExp) {
  clearPressGuard();
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1) ?? document.body);
}

function pick(name: RegExp) {
  clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
}

function nameLeo() {
  press(/^Name/);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Léo' } });
  press(/^Done/);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.user = { hasPin: true };
});

describe('a Kids profile made from the television’s picker', () => {
  it('asks for a name and a level before it can be made', () => {
    render(onScreen(<TvAddKids />));

    expect(
      screen.getByRole('button', { name: /Create the profile/ }).getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('makes it at the picked level, then returns to the picker', async () => {
    mocks.createKids.mockResolvedValue({ user: { id: 'kid' } });
    render(onScreen(<TvAddKids />));

    nameLeo();
    pick(/7\+/);
    press(/Create the profile/);

    await waitFor(() => expect(mocks.switchProfile).toHaveBeenCalled());
    expect(mocks.createKids).toHaveBeenCalledWith({ username: 'Léo', level: 7, libraries: null });
  });

  it('offers an admin with no PIN to set one before returning', async () => {
    mocks.user = { hasPin: false };
    mocks.createKids.mockResolvedValue({ user: { id: 'kid' } });
    render(onScreen(<TvAddKids />));

    nameLeo();
    pick(/10\+/);
    press(/Create the profile/);

    await waitFor(() => expect(screen.getByText('Lock your profile with a PIN?')).toBeTruthy());
    expect(screen.getByText('pin panel')).toBeTruthy();
    expect(mocks.switchProfile).not.toHaveBeenCalled();
  });
});
