// @vitest-environment jsdom

import type { KromaClient } from '@kromatv/client';
import { fakeClient } from '@kromatv/client/test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrashBoundary } from '#tv/app/crash-boundary.component';
import { createDevicePreferences, DevicePreferencesProvider } from '#tv/app/device-preferences';

const preferences = createDevicePreferences();
const crashReportingPrefStore = preferences.crashReporting;

const fallback = () => <span>fallback shown</span>;

function Boom(): ReactNode {
  throw new Error('kaboom');
}

function crashClient() {
  const reportCrash = vi.fn().mockResolvedValue(undefined);
  return { client: fakeClient({ diagnostics: { crash: reportCrash } }), reportCrash };
}

function mount(client: KromaClient | null) {
  return render(
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
    </DevicePreferencesProvider>,
  );
}

function routed(route: string, child: ReactNode) {
  return (
    <DevicePreferencesProvider value={preferences}>
      <CrashBoundary client={null} platform="Tizen" fallback={fallback} resetKey={route}>
        {child}
      </CrashBoundary>
    </DevicePreferencesProvider>
  );
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

  it('renders the tree again once the route moves on', () => {
    const { rerender } = render(routed('detail', <Boom />));

    rerender(routed('home', <span>home screen</span>));

    expect(screen.getByText('home screen')).toBeTruthy();
  });

  it('keeps the fallback while the route stays where it crashed', () => {
    const { rerender } = render(routed('detail', <Boom />));

    rerender(routed('detail', <span>detail screen</span>));

    expect(screen.getByText('fallback shown')).toBeTruthy();
  });
});
