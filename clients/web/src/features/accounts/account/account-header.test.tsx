// @vitest-environment jsdom

import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountHeader } from './account-header';

const auth = vi.hoisted(() => ({
  uploadAvatar: vi.fn(),
  user: {
    id: 'u1',
    username: 'Ada Lovelace',
    email: 'ada@kroma.test',
    avatarUrl: null,
    createdAt: '2026-01-15T10:00:00Z',
  },
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    user: auth.user,
    client: { accounts: { uploadAvatar: auth.uploadAvatar } },
    updateUser: vi.fn(),
    logout: vi.fn(),
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
const PHOTO_URL = 'blob:http://localhost/picked';
const PICKED = new File(['original'], 'me.jpg', { type: 'image/jpeg' });

function pick(file: File | undefined) {
  const input = document.querySelector('input[type="file"]');
  if (!input) {
    throw new Error('no file input');
  }
  fireEvent.change(input, { target: { files: file ? [file] : [] } });
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => PHOTO_URL);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('changing the account photo', () => {
  it('opens the picked photo to be framed rather than uploading it as it is', () => {
    render(<AccountHeader />, { wrapper: Providers });

    pick(PICKED);

    expect(screen.getByRole('button', { name: 'Move the photo' })).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledWith(PICKED);
    expect(auth.uploadAvatar).not.toHaveBeenCalled();
  });

  it('lets go of the photo when the framing is cancelled', () => {
    render(<AccountHeader />, { wrapper: Providers });
    pick(PICKED);

    clearPressGuard();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('button', { name: 'Move the photo' })).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(PHOTO_URL);
  });

  it('opens nothing when the picker is dismissed', () => {
    render(<AccountHeader />, { wrapper: Providers });

    pick(undefined);

    expect(screen.queryByRole('button', { name: 'Move the photo' })).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
