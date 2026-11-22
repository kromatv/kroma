// @vitest-environment jsdom

import { AdminUser } from '@kromatv/client/admin';
import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  me: { id: 'admin' },
  restrictions: {
    get: vi.fn(),
    setLevel: vi.fn(),
    setCountry: vi.fn(),
    setTitleRule: vi.fn(),
  },
  ratings: { get: vi.fn() },
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    user: auth.me,
    client: { admin: { restrictions: auth.restrictions }, accounts: { ratings: auth.ratings } },
  }),
}));
vi.mock('#web/features/admin/title-rules.component', () => ({ TitleRules: () => null }));

import { ProfileRestrictions } from './profile-restrictions.component';

const { render, clearPressGuard } = createInputTestHost();

const kid = AdminUser.parse({
  id: 'kid',
  username: 'Léo',
  avatarUrl: null,
  hasPin: false,
  createdAt: '2026-11-22T00:00:00Z',
  email: null,
  permissions: ['playback'],
  libraries: null,
  role: 'kids',
  online: false,
  emailVerified: false,
  resetRequested: false,
  kids: true,
});

function show(member: AdminUser) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <KitProvider config={{ entry: { physicalKeyboard: true } }}>
      {onScreen(
        <QueryClientProvider client={client}>
          <ProfileRestrictions user={member} />
        </QueryClientProvider>,
      )}
    </KitProvider>,
  );
}

function country(): HTMLElement {
  return screen.getByRole('combobox', { name: /^Ratings country/ });
}

async function unlock() {
  fireEvent.change(await screen.findByLabelText('Your password'), {
    target: { value: 'secret' },
  });
  clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(country().getAttribute('aria-disabled')).not.toBe('true'));
}

function choose(name: string) {
  clearPressGuard();
  fireEvent.click(country());
  clearPressGuard();
  fireEvent.click(screen.getByRole('option', { name }));
}

beforeEach(() => {
  auth.restrictions.get.mockResolvedValue({
    level: 10,
    ratingsCountry: null,
    household: 'CH',
    held: true,
    titles: [],
  });
  auth.restrictions.setLevel.mockResolvedValue(undefined);
  auth.restrictions.setCountry.mockResolvedValue(undefined);
  auth.ratings.get.mockResolvedValue({ country: null, household: 'CH', countries: ['CH', 'DE'] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a profile's ratings country among its restrictions", () => {
  it("reads as the household's and stays shut until the admin types their password", async () => {
    show(kid);

    await waitFor(() => expect(country().getAttribute('aria-label')).toMatch(/Switzerland/));
    expect(country().getAttribute('aria-disabled')).toBe('true');
  });

  it('sends the country the admin picks, with their password', async () => {
    show(kid);
    await unlock();

    choose('Germany');

    await waitFor(() =>
      expect(auth.restrictions.setCountry).toHaveBeenCalledWith('kid', 'DE', 'secret'),
    );
  });

  it("follows the household's again when the admin picks it", async () => {
    auth.restrictions.get.mockResolvedValue({
      level: 10,
      ratingsCountry: 'DE',
      household: 'CH',
      held: true,
      titles: [],
    });
    show(kid);
    await unlock();

    choose('Same as the server (Switzerland)');

    await waitFor(() =>
      expect(auth.restrictions.setCountry).toHaveBeenCalledWith('kid', null, 'secret'),
    );
  });

  it("offers no country on the admin's own profile", async () => {
    show(AdminUser.parse({ ...kid, id: 'admin', kids: false }));

    await waitFor(() => expect(auth.restrictions.get).toHaveBeenCalled());
    expect(screen.queryByRole('combobox', { name: /^Ratings country/ })).toBeNull();
  });
});
