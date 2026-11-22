// @vitest-environment jsdom

import { Invite } from '@kromatv/client/accounts';
import { I18nProvider } from '@kromatv/ui';
import { GuidedFlow, KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PeopleStep } from '#web/features/setup/people-step.component';

const api = vi.hoisted(() => ({ mailInvite: vi.fn() }));

const OPEN = Invite.parse({
  token: 't1',
  permissions: ['playback'],
  createdAt: '2026-11-01T10:00:00Z',
  expiresAt: 1_800_000_000,
  used: false,
});

vi.mock('#web/features/setup/use-invitations.hook', () => ({
  useInvitations: () => ({
    open: [OPEN],
    busy: false,
    create: vi.fn(),
    revoke: vi.fn(),
    change: vi.fn(),
    linkOf: () => 'https://kroma.test/join?invite=t1',
  }),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: { accounts: { mailInvite: api.mailInvite } },
    user: { email: 'owner@kroma.tv', permissions: ['users.manage'] },
  }),
}));

const inputHost = createInputTestHost();

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  inputHost.clearPressGuard();
  api.mailInvite.mockResolvedValue({ delivered: 'smtp' });
});

it('has the server send an invitation from its menu, to the address the owner types', async () => {
  inputHost.render(
    <I18nProvider locale="en">
      <KitProvider config={{ entry: { physicalKeyboard: true } }}>
        {onScreen(
          <GuidedFlow.Root label="Setup">
            <PeopleStep onBack={vi.fn()} onContinue={vi.fn()} />
          </GuidedFlow.Root>,
        )}
      </KitProvider>
    </I18nProvider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  inputHost.clearPressGuard();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Send by e-mail' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('E-mail address'), {
    target: { value: 'lea@kroma.tv' },
  });
  inputHost.clearPressGuard();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Send' }));

  await waitFor(() => expect(screen.getByText('Invitation sent to lea@kroma.tv.')).toBeTruthy());
  expect(api.mailInvite).toHaveBeenCalledWith(OPEN.token, { to: 'lea@kroma.tv', locale: 'en' });
});
