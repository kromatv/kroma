// @vitest-environment jsdom
//
// The report screen inside the app it actually runs in: the memory router, the
// navigation guard, and the detail screen that opens it. Mounted this way on
// purpose the screen itself was never what closed it, the routing around it was,
// and only a test that includes the routing can catch that.

import type { KromaClient } from '@kroma/core';
import { I18nProvider } from '@kroma/ui';
import { clearPressGuard } from '@kroma/ui/kit';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRedirect } from '#tv/app/guard';
import { GUARD } from '#tv/app/navPolicy';
import { EnvProvider } from '#tv/app/providers/env';
import {
  TvClientProvider,
  type TvNav,
  TvNavProvider,
  TvOutlet,
  type TvScreens,
  useNav,
} from '#tv/app/router';
import { TvReport } from '#tv/features/reports/TvReport';

afterEach(() => {
  cleanup();
  clearPressGuard();
});

/** Every screen we do not exercise renders its own name, so a stray redirect
 * shows up as the wrong name on screen rather than as an empty tree. */
function stubScreens(): TvScreens {
  const stub = (name: string) => () => <div>{`screen:${name}`}</div>;
  return {
    connect: stub('connect'),
    profiles: stub('profiles'),
    addProfile: stub('addProfile'),
    quick: stub('quick'),
    deviceSettings: stub('deviceSettings'),
    about: stub('about'),
    pin: stub('pin'),
    profileMenu: stub('profileMenu'),
    settingsGroup: stub('settingsGroup'),
    home: stub('home'),
    grid: stub('grid'),
    genres: stub('genres'),
    genre: stub('genre'),
    search: stub('search'),
    person: stub('person'),
    movie: stub('movie'),
    show: stub('show'),
    player: stub('player'),
    report: TvReport,
  };
}

/** TvApp's guard, verbatim in shape: the redirect is applied from an effect
 * AFTER the screen has mounted, which is what made a missing allow-list entry
 * look like a screen that closes itself. */
function Guard({ signedIn }: Readonly<{ signedIn: boolean }>) {
  const nav = useNav();
  useEffect(() => {
    const target = resolveRedirect(GUARD, { signedIn }, nav.route.name);
    if (target) nav.replace(target);
  }, [signedIn, nav]);
  return <TvOutlet />;
}

/** Hands the live nav out to the test, the way a screen would use it. */
function NavHandle({ onReady }: Readonly<{ onReady: (nav: TvNav) => void }>) {
  const nav = useNav();
  onReady(nav);
  return null;
}

function mountApp(client: Partial<KromaClient> = {}) {
  const createReport = vi.fn().mockResolvedValue({});
  const fake = { createReport, ...client } as unknown as KromaClient;
  let nav!: TvNav;
  render(
    <EnvProvider platform="TV">
      <I18nProvider locale="en">
        <TvClientProvider client={fake}>
          <TvNavProvider screens={stubScreens()}>
            <NavHandle
              onReady={(n) => {
                nav = n;
              }}
            />
            <Guard signedIn />
          </TvNavProvider>
        </TvClientProvider>
      </I18nProvider>
    </EnvProvider>,
  );
  // A signed-in session belongs in the app, not on the picker the router opens
  // on; let the guard's effect move it before the test drives anything.
  act(() => {});
  return { nav: () => nav, createReport };
}

/** Open the report screen the way a film's detail page does. */
function openReport(app: ReturnType<typeof mountApp>) {
  act(() => {
    app.nav().go('report', { kind: 'movie', id: 'm1', title: 'Blade Runner 2049' });
  });
}

describe('TvReport in the app', () => {
  it('stays on screen once opened, instead of being bounced away by the guard', () => {
    const app = mountApp();
    openReport(app);

    expect(screen.getByText('Report a problem')).toBeTruthy();
    expect(screen.getByText('Blade Runner 2049')).toBeTruthy();
    // The bug this pins: the guard replaced the stack and the film's report
    // turned into the home page on the very next tick.
    expect(screen.queryByText('screen:home')).toBeNull();
    expect(app.nav().route.name).toBe('report');
  });

  it('sends the report for the title it was opened on', async () => {
    const app = mountApp();
    openReport(app);

    clearPressGuard();
    fireEvent.click(screen.getByText('Audio problem'));
    fireEvent.click(screen.getByText('Send report'));

    expect(app.createReport).toHaveBeenCalledWith({
      subjectKind: 'movie',
      subjectId: 'm1',
      category: 'audio',
      message: null,
    });
    expect(await screen.findByText('Thanks, your report has been sent.')).toBeTruthy();
  });

  it('will not send until a category has been picked', () => {
    const app = mountApp();
    openReport(app);

    clearPressGuard();
    fireEvent.click(screen.getByText('Send report'));
    expect(app.createReport).not.toHaveBeenCalled();
  });
});
