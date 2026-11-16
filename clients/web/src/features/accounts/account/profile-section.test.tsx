// @vitest-environment jsdom

import { KitProvider } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileSection } from './profile-section.component';

const auth = vi.hoisted(() => ({
  update: vi.fn(),
  updateUser: vi.fn(),
  user: { id: 'u1', username: 'Ada Lovelace', email: 'ada@kroma.test' },
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    user: auth.user,
    client: { accounts: { update: auth.update } },
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

const save = () => screen.getByRole('button', { name: 'Save' });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the personal information card', () => {
  it('has nothing to save until a field changes', () => {
    render(<ProfileSection />, { wrapper: Providers });

    expect(save().getAttribute('aria-disabled')).toBe('true');
  });

  it('saves only the field that changed, and takes the server at its word', async () => {
    auth.update.mockResolvedValue({ user: { username: 'Ada', email: 'ada@kroma.test' } });
    render(<ProfileSection />, { wrapper: Providers });

    fireEvent.change(screen.getByDisplayValue('Ada Lovelace'), { target: { value: ' Ada ' } });
    fireEvent.click(save());

    await waitFor(() => expect(auth.update).toHaveBeenCalledWith({ username: 'Ada' }));
    expect(auth.updateUser).toHaveBeenCalledWith({ username: 'Ada', email: 'ada@kroma.test' });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('will not save a name left empty', () => {
    render(<ProfileSection />, { wrapper: Providers });

    fireEvent.change(screen.getByDisplayValue('Ada Lovelace'), { target: { value: '  ' } });

    expect(save().getAttribute('aria-disabled')).toBe('true');
  });
});
