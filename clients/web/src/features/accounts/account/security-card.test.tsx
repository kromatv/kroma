// @vitest-environment jsdom

import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinCard } from './pin-card';
import { SecurityCard } from './security-card';

const auth = vi.hoisted(() => ({
  user: { id: 'u1', hasPin: false },
  changePassword: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    user: auth.user,
    client: { accounts: { changePassword: auth.changePassword } },
    updateUser: vi.fn(),
  }),
}));

const { render, clearPressGuard } = createInputTestHost();

function press(name: string) {
  clearPressGuard();
  fireEvent.click(screen.getAllByRole('button', { name }).at(-1) as HTMLElement);
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function Providers({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <KitProvider config={{ entry: { physicalKeyboard: true } }}>
      {onScreen(<>{children}</>)}
    </KitProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.user = { id: 'u1', hasPin: false };
});

describe('the password card', () => {
  it('opens its dialog only when the change is asked for', () => {
    render(<SecurityCard />, { wrapper: Providers });

    expect(screen.queryByText('Current password')).toBeNull();

    press('Update password');

    expect(screen.getByText('Current password')).toBeTruthy();
    expect(screen.getByText('Confirm password')).toBeTruthy();
  });

  it('closes again on cancel', () => {
    render(<SecurityCard />, { wrapper: Providers });
    press('Update password');

    press('Cancel');

    expect(screen.queryByText('Current password')).toBeNull();
  });

  it('sends the current and the new password, then closes', async () => {
    auth.changePassword.mockResolvedValue(undefined);
    render(<SecurityCard />, { wrapper: Providers });
    press('Update password');

    type('Current password', 'old secret');
    type('New password', 'new secret');
    type('Confirm password', 'new secret');
    press('Update password');

    await waitFor(() =>
      expect(auth.changePassword).toHaveBeenCalledWith('old secret', 'new secret'),
    );
    await waitFor(() => expect(screen.queryByText('Current password')).toBeNull());
  });

  it('sends nothing while the two new passwords differ, and says so', () => {
    render(<SecurityCard />, { wrapper: Providers });
    press('Update password');

    type('Current password', 'old secret');
    type('New password', 'new secret');
    type('Confirm password', 'another');
    press('Update password');

    expect(screen.getByText(/don.t match/)).toBeTruthy();
    expect(auth.changePassword).not.toHaveBeenCalled();
  });
});

describe('the profile lock card', () => {
  it('is a switch that is off, and turning it on asks for a new PIN', () => {
    render(<PinCard />, { wrapper: Providers });
    const lock = screen.getByRole('switch', { name: 'Profile lock' });

    expect(lock.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Change PIN' })).toBeNull();

    clearPressGuard();
    fireEvent.click(lock);

    expect(screen.getByText('Choose a 4-digit PIN')).toBeTruthy();
  });

  it('is on once a PIN is set, and turning it off asks for the current PIN', () => {
    auth.user = { id: 'u1', hasPin: true };
    render(<PinCard />, { wrapper: Providers });
    const lock = screen.getByRole('switch', { name: 'Profile lock' });

    expect(lock.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeTruthy();

    clearPressGuard();
    fireEvent.click(lock);

    expect(screen.getByText('Enter your current PIN')).toBeTruthy();
  });
});
