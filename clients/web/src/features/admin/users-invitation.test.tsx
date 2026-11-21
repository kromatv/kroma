// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { member } from '#web/features/admin/users.fixture';
import { WaitingInvitation } from '#web/features/admin/users-invitation.component';

const api = vi.hoisted(() => ({
  inviteUser: vi.fn(),
  confirm: vi.fn(),
  onMinted: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { admin: { inviteUser: api.inviteUser } } }),
}));

vi.mock('@kromatv/ui/kit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@kromatv/ui/kit')>()),
  useConfirm: () => api.confirm,
}));

const LINK = 'https://kroma.example/join?invite=t1';

const inputHost = createInputTestHost();

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  inputHost.clearPressGuard();
  api.confirm.mockResolvedValue(true);
  api.inviteUser.mockResolvedValue({
    token: 't1',
    url: LINK,
    permissions: ['playback'],
    expiresAt: 1_800_000_000,
  });
});

function show(fields: Parameters<typeof member>[0]) {
  inputHost.render(
    <I18nProvider locale="en">
      <WaitingInvitation user={member(fields)} onMinted={api.onMinted} />
    </I18nProvider>,
  );
}

function mint() {
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'New invitation link' }));
}

describe('the invitation of an account that waits', () => {
  it('says that nobody has signed in yet and that the invitation has expired', () => {
    show({ invitation: 'expired' });

    expect(screen.getByText(/its invitation has expired/)).toBeTruthy();
  });

  it('makes a new link for an expired invitation and shows it to copy', async () => {
    show({ invitation: 'expired' });

    mint();

    await waitFor(() => expect(screen.getByText(LINK)).toBeTruthy());
    expect(api.inviteUser).toHaveBeenCalledWith('u1');
    expect(api.confirm).not.toHaveBeenCalled();
    expect(api.onMinted).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('asks before replacing an invitation that still works, and keeps it when the owner backs out', async () => {
    api.confirm.mockResolvedValue(false);
    show({ invitation: 'pending' });

    mint();

    await waitFor(() => expect(api.confirm).toHaveBeenCalled());
    expect(api.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'The link lea may already have stops working.' }),
    );
    expect(api.inviteUser).not.toHaveBeenCalled();
  });

  it('says so when no link could be made', async () => {
    api.inviteUser.mockRejectedValue(new Error('409'));
    show({ invitation: 'none' });

    mint();

    await waitFor(() =>
      expect(screen.getByText('Could not make a new link. Try again.')).toBeTruthy(),
    );
    expect(api.onMinted).not.toHaveBeenCalled();
  });
});
