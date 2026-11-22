// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { member } from '#web/features/admin/users.fixture';
import { AccountLinks } from '#web/features/admin/users-account-links.component';

const api = vi.hoisted(() => ({
  resetUser: vi.fn(),
  clearUserPin: vi.fn(),
  sendEmailVerification: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: {
      admin: {
        resetUser: api.resetUser,
        clearUserPin: api.clearUserPin,
        sendEmailVerification: api.sendEmailVerification,
      },
    },
  }),
}));

vi.mock('@kromatv/ui/kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui/kit')>()),
  useConfirm: () => api.confirm,
}));

const inputHost = createInputTestHost();

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  inputHost.clearPressGuard();
  api.confirm.mockResolvedValue(true);
  api.clearUserPin.mockResolvedValue(undefined);
  api.resetUser.mockResolvedValue({
    token: 'r1',
    code: 'ABCD2345',
    url: 'https://kroma.example/reset?token=r1',
    expiresAt: 1_800_000_000,
    delivered: 'manual',
  });
  api.sendEmailVerification.mockResolvedValue({
    token: 'v1',
    url: 'https://kroma.example/verify-email?token=v1',
    expiresAt: 1_800_000_000,
    delivered: 'smtp',
  });
});

function show(fields: Parameters<typeof member>[0] = {}) {
  inputHost.render(
    <I18nProvider locale="en">
      <KitProvider config={{ entry: { physicalKeyboard: true } }}>
        {onScreen(<AccountLinks user={member(fields)} />)}
      </KitProvider>
    </I18nProvider>,
  );
}

function press(name: string) {
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('a way back in for a member who is locked out', () => {
  it('mints a reset once the owner agrees and shows its one-time code', async () => {
    show();

    press('Reset access');

    await waitFor(() => expect(screen.getByText('ABCD2345')).toBeTruthy());
    expect(api.resetUser).toHaveBeenCalledWith('u1');
  });

  it('mints nothing when the owner backs out', async () => {
    api.confirm.mockResolvedValue(false);
    show();

    press('Reset access');

    await waitFor(() => expect(api.confirm).toHaveBeenCalled());
    expect(api.resetUser).not.toHaveBeenCalled();
  });

  it('says so when no reset could be minted', async () => {
    api.resetUser.mockRejectedValue(new Error('500'));
    show();

    press('Reset access');

    await waitFor(() => expect(screen.getByText("Couldn't mint the reset")).toBeTruthy());
  });

  it('says that the member asked for a reset from the sign-in screen', () => {
    show({ resetRequested: true });

    expect(screen.getByText('This user asked for a reset from the sign-in screen.')).toBeTruthy();
  });
});

describe('the profile PIN of a member', () => {
  it('is cleared once the owner agrees, and the button says so', async () => {
    show({ hasPin: true });

    press('Clear PIN');

    await waitFor(() => expect(screen.getByRole('button', { name: 'PIN cleared' })).toBeTruthy());
    expect(api.clearUserPin).toHaveBeenCalledWith('u1');
  });

  it('offers nothing to clear on an account that has none', () => {
    show({ hasPin: false });

    expect(screen.getByRole('button', { name: 'Clear PIN' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });
});

describe('the check of a member address', () => {
  it('sends a verification link and says how it left', async () => {
    show();

    press('Send verification email');

    await waitFor(() => expect(screen.getByText('Verification link sent')).toBeTruthy());
    expect(api.sendEmailVerification).toHaveBeenCalledWith('u1');
  });

  it('says so when the link could not be sent', async () => {
    api.sendEmailVerification.mockRejectedValue(new Error('500'));
    show();

    press('Send verification email');

    await waitFor(() => expect(screen.getByText('Could not send')).toBeTruthy());
  });
});
