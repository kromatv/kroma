// @vitest-environment jsdom

import { KromaApiError } from '@kromatv/client';
import { InviteToken } from '@kromatv/client/accounts';
import { I18nProvider } from '@kromatv/ui';
import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationMailForm } from '#web/shared/ui/invitation-mail.component';

const api = vi.hoisted(() => ({
  mailInvite: vi.fn(),
  testRelay: vi.fn(),
  user: { email: 'owner@kroma.tv', permissions: ['users.manage', 'settings.manage'] },
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: { accounts: { mailInvite: api.mailInvite }, admin: { testRelay: api.testRelay } },
    user: api.user,
  }),
}));

const TOKEN = InviteToken.parse('t1');

const inputHost = createInputTestHost();

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  inputHost.clearPressGuard();
  api.user.permissions = ['users.manage', 'settings.manage'];
  api.mailInvite.mockResolvedValue({ delivered: 'relay' });
  api.testRelay.mockResolvedValue({ sentTo: 'owner@kroma.tv', asked: true });
});

function show(address: string | null = 'lea@kroma.tv') {
  inputHost.render(
    <I18nProvider locale="en">
      <KitProvider config={{ entry: { physicalKeyboard: true } }}>
        {onScreen(<InvitationMailForm token={TOKEN} address={address} />)}
      </KitProvider>
    </I18nProvider>,
  );
}

function press(name: string) {
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
}

const sendButton = () => screen.getByRole('button', { name: 'Send' });

describe('sending an invitation by e-mail', () => {
  it('sends it to the address typed, in the language the page is read in', async () => {
    show(null);

    fireEvent.change(screen.getByLabelText('E-mail address'), {
      target: { value: ' lea@kroma.tv ' },
    });
    press('Send');

    await waitFor(() => expect(screen.getByText('Invitation sent to lea@kroma.tv.')).toBeTruthy());
    expect(api.mailInvite).toHaveBeenCalledWith(TOKEN, { to: 'lea@kroma.tv', locale: 'en' });
  });

  it('offers no send for what is not an address', () => {
    show(null);

    fireEvent.change(screen.getByLabelText('E-mail address'), { target: { value: 'lea' } });

    expect(sendButton().getAttribute('aria-disabled')).toBe('true');
  });

  it('says what to do when the server sends no mail', async () => {
    api.mailInvite.mockResolvedValue({ delivered: 'manual' });
    show();

    press('Send');

    await waitFor(() =>
      expect(screen.getByText(/this server does not send e-mail yet/)).toBeTruthy(),
    );
  });

  it('says that an address closed to this server refused it', async () => {
    api.mailInvite.mockResolvedValue({ delivered: 'refused' });
    show();

    press('Send');

    await waitFor(() =>
      expect(screen.getByText(/this address is closed to this server/)).toBeTruthy(),
    );
  });

  it('says why the mail could not leave and that the invitation still works', async () => {
    api.mailInvite.mockRejectedValue(
      new KromaApiError(502, 'x', { error: 'The e-mail could not leave: connection refused' }),
    );
    show();

    press('Send');

    await waitFor(() =>
      expect(screen.getByText('The e-mail could not leave: connection refused')).toBeTruthy(),
    );
    expect(screen.getByText(/The invitation still works/)).toBeTruthy();
  });
});

describe('a server the relay does not carry yet', () => {
  it('leads the owner to allow it, through the address of their own account', async () => {
    api.mailInvite.mockResolvedValue({ delivered: 'inactive' });
    show();
    press('Send');
    await waitFor(() =>
      expect(screen.getByText(/The relay asks you at owner@kroma.tv/)).toBeTruthy(),
    );

    press('Send me the question');

    await waitFor(() =>
      expect(screen.getByText(/The relay's question went to owner@kroma.tv/)).toBeTruthy(),
    );
    expect(api.testRelay).toHaveBeenCalledOnce();
  });

  it('says the relay now carries the mail when the server was allowed meanwhile', async () => {
    api.mailInvite.mockResolvedValue({ delivered: 'inactive' });
    api.testRelay.mockResolvedValue({ sentTo: 'owner@kroma.tv' });
    show();
    press('Send');
    await waitFor(() => expect(screen.getByText(/The relay asks you at/)).toBeTruthy());

    press('Send me the question');

    await waitFor(() => expect(screen.getByText(/The relay now carries/)).toBeTruthy());
  });

  it('says why the relay could not be asked', async () => {
    api.mailInvite.mockResolvedValue({ delivered: 'inactive' });
    api.testRelay.mockRejectedValue(
      new KromaApiError(502, 'x', { error: 'The test failed: unreachable' }),
    );
    show();
    press('Send');
    await waitFor(() => expect(screen.getByText(/The relay asks you at/)).toBeTruthy());

    press('Send me the question');

    await waitFor(() => expect(screen.getByText('The test failed: unreachable')).toBeTruthy());
  });

  it('tells an administrator who cannot allow it who can', async () => {
    api.user.permissions = ['users.manage'];
    api.mailInvite.mockResolvedValue({ delivered: 'inactive' });
    show();

    press('Send');

    await waitFor(() => expect(screen.getByText(/The owner of the server allows it/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Send me the question' })).toBeNull();
  });
});
