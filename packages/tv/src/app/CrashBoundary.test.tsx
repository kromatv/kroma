// @vitest-environment jsdom

import type { KromaClient } from '@kroma/core';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrashBoundary } from '#tv/app/CrashBoundary';
import { crashReportingPrefStore } from '#tv/app/crashReportingPref';

function Boom(): ReactNode {
  throw new Error('kaboom');
}

function fakeClient() {
  const reportCrash = vi.fn().mockResolvedValue(undefined);
  return { client: { reportCrash } as unknown as KromaClient, reportCrash };
}

function mount(client: KromaClient | null) {
  return render(
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
    </CrashBoundary>,
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
    const { client } = fakeClient();
    mount(client);
    expect(screen.getByText('fallback shown')).toBeTruthy();
  });

  it('reports the crash when the user opted in', () => {
    crashReportingPrefStore.set('on');
    const { client, reportCrash } = fakeClient();
    mount(client);
    expect(reportCrash).toHaveBeenCalledTimes(1);
    const report = reportCrash.mock.calls[0]?.[0];
    expect(report.message).toBe('kaboom');
    expect(report.platform).toBe('Android TV');
  });

  it('stays silent when the user has not opted in', () => {
    crashReportingPrefStore.set('off');
    const { client, reportCrash } = fakeClient();
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
    mount({ reportCrash } as unknown as KromaClient);
    await Promise.resolve();
    expect(reportCrash).toHaveBeenCalledTimes(1);
    expect(screen.getByText('fallback shown')).toBeTruthy();
  });
});
