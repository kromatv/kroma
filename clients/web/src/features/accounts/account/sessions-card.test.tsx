// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';
import { SessionsCard } from './sessions-card';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TV = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function device(id: string, extra: object) {
  return {
    id,
    userAgent: TV,
    createdAt: '2026-11-01T10:00:00Z',
    lastSeen: '2026-11-14T10:00:00Z',
    current: false,
    ...extra,
  };
}

async function mount(devices: object[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(devices), { headers: { 'content-type': 'application/json' } }),
    ),
  );
  const runtime = createWebTestRuntime({});
  render(
    <QueryClientProvider client={runtime.queryClient}>
      <WebRuntimeProvider value={runtime}>
        <I18nProvider locale="en">
          <SessionsCard />
        </I18nProvider>
      </WebRuntimeProvider>
    </QueryClientProvider>,
  );
  await screen.findAllByText('Sign out');
}

describe('SessionsCard', () => {
  it('shows the app version each device last used', async () => {
    await mount([device('a', { app: { shell: 'webos', version: '0.1.39' }, outdated: false })]);

    expect(screen.getByText(/Version 0\.1\.39/)).toBeTruthy();
    expect(screen.queryByText('Outdated')).toBeNull();
  });

  it('marks a device whose app is older than the server serves', async () => {
    await mount([device('a', { app: { shell: 'tizen', version: '0.1.20' }, outdated: true })]);

    expect(screen.getByText(/Version 0\.1\.20/)).toBeTruthy();
    expect(screen.getByText('Outdated')).toBeTruthy();
  });

  it('says version unknown for a device that never sent one, and never outdated', async () => {
    await mount([device('a', {}), device('b', { app: null, outdated: false })]);

    expect(screen.getAllByText(/Version unknown/)).toHaveLength(2);
    expect(screen.queryByText('Outdated')).toBeNull();
  });
});
