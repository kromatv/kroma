// @vitest-environment jsdom

import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KidsModal } from './users-kids-modal.component';

const auth = vi.hoisted(() => ({
  user: { id: 'admin', hasPin: false },
  createKids: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => auth.navigate }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    user: auth.user,
    client: { admin: { createKids: auth.createKids }, accounts: {} },
    updateUser: vi.fn(),
  }),
}));
vi.mock('#web/features/admin/library-visibility.component', () => ({
  LibraryVisibility: () => null,
}));

const { render, clearPressGuard } = createInputTestHost();

function press(name: string) {
  clearPressGuard();
  const last = screen.getAllByRole('button', { name }).at(-1);
  if (last) {
    fireEvent.click(last);
  }
}

function Providers({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <KitProvider config={{ entry: { physicalKeyboard: true } }}>
      {onScreen(<>{children}</>)}
    </KitProvider>
  );
}

function createLeo(): Promise<boolean> {
  auth.createKids.mockResolvedValue({ user: { id: 'kid' } });
  render(<KidsModal />, { wrapper: Providers });
  let answer: Promise<boolean> = Promise.resolve(false);
  act(() => {
    answer = KidsModal.call();
  });
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Léo' } });
  clearPressGuard();
  fireEvent.click(screen.getByRole('radio', { name: /7\+/ }));
  press('Create the profile');
  return answer;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  auth.user = { id: 'admin', hasPin: false };
});

describe('creating a Kids profile', () => {
  it('offers an admin with no PIN to set one, and takes them straight to it', async () => {
    const answer = createLeo();

    await waitFor(() => expect(screen.getByText('Lock your profile with a PIN?')).toBeTruthy());
    press('Set a PIN');

    await expect(answer).resolves.toBe(true);
    expect(auth.navigate).toHaveBeenCalledWith({
      to: '/account',
      search: { section: 'security', pin: 'set' },
    });
  });

  it('lets the admin leave the offer and still counts the profile as made', async () => {
    const answer = createLeo();
    await waitFor(() => expect(screen.getByText('Lock your profile with a PIN?')).toBeTruthy());

    press('Not now');

    await expect(answer).resolves.toBe(true);
  });

  it('asks nothing more of an admin whose profile already has a PIN', async () => {
    auth.user = { id: 'admin', hasPin: true };

    const answer = createLeo();

    await expect(answer).resolves.toBe(true);
    expect(screen.queryByText('Lock your profile with a PIN?')).toBeNull();
  });
});
