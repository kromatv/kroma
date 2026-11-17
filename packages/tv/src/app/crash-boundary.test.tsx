// @vitest-environment jsdom

import type { KromaClient } from '@kromatv/client';
import { fakeClient } from '@kromatv/client/test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrashBoundary } from '#tv/app/crash-boundary.component';
import { createDevicePreferences, DevicePreferencesProvider } from '#tv/app/device-preferences';
import { TvNavProvider, useNav } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';

const preferences = createDevicePreferences();
const crashReportingPrefStore = preferences.crashReporting;

function Boom(): ReactNode {
  throw new Error('kaboom');
}

function crashClient() {
  const reportCrash = vi.fn().mockResolvedValue(undefined);
  return { client: fakeClient({ diagnostics: { crash: reportCrash } }), reportCrash };
}

function mount(client: KromaClient | null) {
  return render(
    <TvNavProvider screens={stubScreens()}>
      <DevicePreferencesProvider value={preferences}>
        <CrashBoundary
          client={client}
          platform="Android TV"
          fallback={(retry) => (
            <button type="button" onClick={retry}>
              fallback shown
            </button>
          )}
        >
          <Boom />
        </CrashBoundary>
      </DevicePreferencesProvider>
    </TvNavProvider>,
  );
}

function CrashesOnGenres(): ReactNode {
  const { route } = useNav();
  if (route.name === 'genres') {
    throw new Error('kaboom');
  }
  return <p>{`on ${route.name}`}</p>;
}

function Leave() {
  const nav = useNav();
  return (
    <button type="button" onClick={nav.back}>
      leave
    </button>
  );
}

function OpenGenres() {
  const nav = useNav();
  return (
    <button type="button" onClick={() => nav.go('genres')}>
      open genres
    </button>
  );
}

function mountRoutes() {
  render(
    <TvNavProvider screens={stubScreens()}>
      <DevicePreferencesProvider value={preferences}>
        <OpenGenres />
        <CrashBoundary client={null} platform="Tizen" fallback={() => <Leave />}>
          <CrashesOnGenres />
        </CrashBoundary>
      </DevicePreferencesProvider>
    </TvNavProvider>,
  );
}

async function click(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByText(label));
  });
}

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));

afterEach(() => {
  cleanup();
  crashReportingPrefStore.set('off');
  vi.restoreAllMocks();
});

describe('CrashBoundary', () => {
  it('renders the fallback instead of the crashed tree', () => {
    const { client } = crashClient();
    mount(client);
    expect(screen.getByText('fallback shown')).toBeTruthy();
  });

  it('reports the crash when the user opted in', () => {
    crashReportingPrefStore.set('on');
    const { client, reportCrash } = crashClient();
    mount(client);
    expect(reportCrash).toHaveBeenCalledTimes(1);
    const report = reportCrash.mock.calls[0]?.[0];
    expect(report.message).toBe('kaboom');
    expect(report.platform).toBe('Android TV');
  });

  it('stays silent when the user has not opted in', () => {
    crashReportingPrefStore.set('off');
    const { client, reportCrash } = crashClient();
    mount(client);
    expect(reportCrash).not.toHaveBeenCalled();
  });

  it('does not throw when there is no client to report to', () => {
    crashReportingPrefStore.set('on');
    expect(() => mount(null)).not.toThrow();
    expect(screen.getByText('fallback shown')).toBeTruthy();
  });

  it('swallows a failed report', async () => {
    crashReportingPrefStore.set('on');
    const reportCrash = vi.fn().mockRejectedValue(new Error('offline'));
    mount(fakeClient({ diagnostics: { crash: reportCrash } }));
    await Promise.resolve();
    expect(reportCrash).toHaveBeenCalledTimes(1);
    expect(screen.getByText('fallback shown')).toBeTruthy();
  });

  it('shows the screen underneath once the viewer leaves the crashed one', async () => {
    mountRoutes();
    await click('open genres');

    await click('leave');

    expect(screen.getByText('on profiles')).toBeTruthy();
  });

  it('keeps the fallback while the crashed screen is still on top', async () => {
    mountRoutes();

    await click('open genres');

    expect(screen.getByText('leave')).toBeTruthy();
  });
});
