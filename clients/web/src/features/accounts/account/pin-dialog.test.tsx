// @vitest-environment jsdom

import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinDialog, type PinTask } from './pin-dialog';

const auth = vi.hoisted(() => ({
  setPin: vi.fn(),
  clearPin: vi.fn(),
  clearPinWithPassword: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: {
      accounts: {
        setPin: auth.setPin,
        clearPin: auth.clearPin,
        clearPinWithPassword: auth.clearPinWithPassword,
      },
    },
    updateUser: auth.updateUser,
  }),
}));

function Providers({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <KitProvider config={{ entry: { physicalKeyboard: true } }}>
      {onScreen(<>{children}</>)}
    </KitProvider>
  );
}

const { render, clearPressGuard } = createInputTestHost();
const onClose = vi.fn();

function press(name: string) {
  clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
}

function open(task: PinTask) {
  render(<PinDialog task={task} onClose={onClose} />, { wrapper: Providers });
}

function enter(code: string) {
  const input = document.querySelector('input');
  if (!input) throw new Error('no code field');
  fireEvent.change(input, { target: { value: code } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('setting a PIN', () => {
  it('asks for the code, then once more, and saves it when both match', async () => {
    auth.setPin.mockResolvedValue({ user: { hasPin: true } });
    open('set');

    expect(screen.getByText('Choose a 4-digit PIN')).toBeTruthy();
    enter('1234');
    expect(await screen.findByText('Enter it once more')).toBeTruthy();
    enter('1234');

    await waitFor(() => expect(auth.setPin).toHaveBeenCalledWith('1234', undefined));
    expect(auth.updateUser).toHaveBeenCalledWith({ hasPin: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('starts over at the new code when the second one differs, and says why', async () => {
    open('set');

    enter('1234');
    await screen.findByText('Enter it once more');
    enter('9999');

    expect(await screen.findByText("PINs don't match")).toBeTruthy();
    expect(screen.getByText('Choose a 4-digit PIN')).toBeTruthy();
    expect(auth.setPin).not.toHaveBeenCalled();
  });
});

describe('changing a PIN', () => {
  it('asks for the current one first and sends it with the new one', async () => {
    auth.setPin.mockResolvedValue({ user: { hasPin: true } });
    open('change');

    expect(screen.getByText('Enter your current PIN')).toBeTruthy();
    enter('1111');
    await screen.findByText('Choose a 4-digit PIN');
    enter('2222');
    await screen.findByText('Enter it once more');
    enter('2222');

    await waitFor(() => expect(auth.setPin).toHaveBeenCalledWith('2222', '1111'));
  });
});

describe('turning the lock off', () => {
  it('needs the current PIN and nothing else', async () => {
    auth.clearPin.mockResolvedValue({ user: { hasPin: false } });
    open('remove');

    enter('1111');

    await waitFor(() => expect(auth.clearPin).toHaveBeenCalledWith('1111'));
    expect(auth.updateUser).toHaveBeenCalledWith({ hasPin: false });
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open and says so when the PIN is refused', async () => {
    auth.clearPin.mockRejectedValue(new Error('nope'));
    open('remove');

    enter('1111');

    expect(await screen.findByText("Couldn't save")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('a forgotten PIN', () => {
  it('is turned off with the account password instead', async () => {
    auth.clearPinWithPassword.mockResolvedValue({ user: { hasPin: false } });
    open('remove');

    press('Forgot your PIN?');
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'secret' } });
    press('Turn off the lock');

    await waitFor(() => expect(auth.clearPinWithPassword).toHaveBeenCalledWith('secret'));
    expect(auth.updateUser).toHaveBeenCalledWith({ hasPin: false });
    expect(onClose).toHaveBeenCalled();
  });

  it('is offered only where the current PIN is asked for', async () => {
    open('set');

    expect(screen.queryByRole('button', { name: 'Forgot your PIN?' })).toBeNull();
  });

  it('keeps the lock and says why when the password is refused', async () => {
    auth.clearPinWithPassword.mockRejectedValue(new Error('nope'));
    open('change');

    press('Forgot your PIN?');
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
    press('Turn off the lock');

    expect(await screen.findByText("Couldn't save")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
