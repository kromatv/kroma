// @vitest-environment jsdom

import { Invite } from '@kromatv/client/accounts';
import { I18nProvider } from '@kromatv/ui';
import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingInvite } from '#web/features/admin/users-pending-invite.component';

const api = vi.hoisted(() => ({
  revokeInvite: vi.fn(),
  onChange: vi.fn(),
  copyText: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: { accounts: { revokeInvite: api.revokeInvite, mailInvite: vi.fn() } },
    user: { email: 'owner@kroma.tv', permissions: ['users.manage'] },
  }),
}));

vi.mock('#web/shared/lib/copy-text', () => ({ copyText: api.copyText }));

const INVITE = Invite.parse({
  token: 't1',
  permissions: ['playback'],
  createdAt: '2026-11-01T10:00:00Z',
  expiresAt: 1_800_000_000,
  used: false,
});

const inputHost = createInputTestHost();

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  inputHost.clearPressGuard();
  api.revokeInvite.mockResolvedValue(undefined);
  api.copyText.mockResolvedValue(true);
});

function show() {
  inputHost.render(
    <I18nProvider locale="en">
      <KitProvider config={{ entry: { physicalKeyboard: true } }}>
        {onScreen(<PendingInvite inv={INVITE} onChange={api.onChange} />)}
      </KitProvider>
    </I18nProvider>,
  );
}

function press(name: string) {
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
}

describe('an invitation nobody has redeemed', () => {
  it('opens the form that has the server send it by e-mail', async () => {
    show();

    press('Send by e-mail');

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Send the invitation by e-mail')).toBeTruthy();
  });

  it('copies its join link', async () => {
    show();

    press('Resend');

    await waitFor(() => expect(screen.getByText('Link copied')).toBeTruthy());
    expect(api.copyText).toHaveBeenCalledWith(expect.stringMatching(/\/join\?invite=t1$/));
  });

  it('takes it back and asks the list to refresh', async () => {
    show();

    press('Cancel');

    await waitFor(() => expect(api.onChange).toHaveBeenCalled());
    expect(api.revokeInvite).toHaveBeenCalledWith(INVITE.token);
  });
});
