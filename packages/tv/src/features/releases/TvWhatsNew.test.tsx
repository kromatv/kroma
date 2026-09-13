// @vitest-environment jsdom

import type { ReleasesView } from '@kromatv/client/releases';
import { fakeClient } from '@kromatv/client/test';
import { I18nProvider } from '@kromatv/ui';
import { clearPressGuard } from '@kromatv/ui/kit';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvProvider } from '#tv/app/providers/env';
import { TvClientProvider, type TvNav, TvNavProvider, TvOutlet, useNav } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { TvWhatsNew } from '#tv/features/releases/TvWhatsNew';

vi.mock('#tv/app/providers/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#tv/app/providers/auth')>()),
  useAuth: () => ({ user: { id: 'u1' }, ready: true }),
}));

afterEach(() => {
  cleanup();
  clearPressGuard();
  sessionStorage.clear();
});

const FIRST = {
  title: 'When a film ends, another is ready',
  body: 'The player shows the title closest to the one you just watched.',
};
const SECOND = {
  title: 'Titles follow your language',
  body: 'Each account reads titles and synopses in its own language.',
};

const VIEW: ReleasesView = {
  current: '0.1.39',
  unseen: '0.1.39',
  releases: [{ version: '0.1.39', action: [], highlights: [FIRST, SECOND], fixed: [], owner: [] }],
};

function NavHandle({ onReady }: Readonly<{ onReady: (nav: TvNav) => void }>) {
  onReady(useNav());
  return null;
}

async function openWhatsNew() {
  const markSeen = vi.fn().mockResolvedValue(undefined);
  const client = fakeClient({ releases: { list: vi.fn().mockResolvedValue(VIEW), markSeen } });
  let nav!: TvNav;
  render(
    <EnvProvider platform="TV">
      <I18nProvider locale="en">
        <TvClientProvider client={client}>
          <TvNavProvider screens={stubScreens({ whatsNew: TvWhatsNew })}>
            <NavHandle
              onReady={(next) => {
                nav = next;
              }}
            />
            <TvOutlet />
          </TvNavProvider>
        </TvClientProvider>
      </I18nProvider>
    </EnvProvider>,
  );
  act(() => nav.reset('home'));
  act(() => nav.go('whatsNew'));
  await screen.findByText(FIRST.body);
  clearPressGuard();
  return { nav: () => nav, markSeen };
}

describe('TvWhatsNew', () => {
  it('marks the release seen as soon as it opens', async () => {
    const app = await openWhatsNew();

    expect(app.markSeen).toHaveBeenCalledWith('0.1.39');
  });

  it('shows the next highlight on Next', async () => {
    await openWhatsNew();

    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText(SECOND.body)).toBeTruthy();
  });

  it('closes back to home from the last highlight', async () => {
    const app = await openWhatsNew();
    fireEvent.click(screen.getByText('Next'));

    fireEvent.click(screen.getByText('Done'));

    expect(app.nav().route.name).toBe('home');
  });

  it('hands over to the history on All versions, so Back still lands home', async () => {
    const app = await openWhatsNew();

    fireEvent.click(screen.getByText('All versions'));

    expect(app.nav().route.name).toBe('releases');
    expect(app.nav().depth).toBe(2);
  });
});
