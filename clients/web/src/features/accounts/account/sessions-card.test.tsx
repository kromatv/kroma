// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';
import { SessionsCard } from './sessions-card';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TV = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function device(id: string, extra: object = {}) {
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
  const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(devices), { headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetch);
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
  await screen.findAllByText(/Version/);
  return fetch;
}

const deleted = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => String(url));

describe('SessionsCard', () => {
  it('shows the app version each device last used', async () => {
    await mount([device('a', { app: { shell: 'webos', version: '0.1.39' }, outdated: false })]);

    expect(screen.getByText(/Version 0\.1\.39/)).toBeTruthy();
    expect(screen.queryByText('Outdated')).toBeNull();
  });

  it('marks a device whose app is older than the server serves', async () => {
    await mount([device('a', { app: { shell: 'tizen', version: '0.1.20' }, outdated: true })]);

    expect(screen.getByText('Outdated')).toBeTruthy();
  });

  it('says version unknown for a device that never sent one, and never outdated', async () => {
    await mount([device('a'), device('b', { app: null, outdated: false })]);

    expect(screen.getAllByText(/Version unknown/)).toHaveLength(2);
    expect(screen.queryByText('Outdated')).toBeNull();
  });

  it('opens a device onto its address, its road and its whole user agent', async () => {
    await mount([device('a', { address: '203.0.113.9', via: 'internet' })]);

    fireEvent.click(screen.getByLabelText(/Details for/));

    expect(screen.getByText('IP address')).toBeTruthy();
    expect(screen.getAllByText(/203\.0\.113\.9/).length).toBeGreaterThan(0);
    expect(screen.getByText('Internet')).toBeTruthy();
    expect(screen.getByText(TV)).toBeTruthy();
  });

  it('signs one device out from its details', async () => {
    const fetch = await mount([device('a', { current: true }), device('b')]);

    fireEvent.click(screen.getAllByLabelText(/Details for/)[1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Sign this device out' }));

    await waitFor(() => expect(deleted(fetch)).toEqual([expect.stringMatching(/sessions\/b$/)]));
  });

  it('signs every other device out with one press', async () => {
    const fetch = await mount([device('a', { current: true }), device('b'), device('c')]);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' }));

    await waitFor(() => expect(deleted(fetch)).toEqual([expect.stringMatching(/sessions$/)]));
  });

  it('offers no sign-out-everywhere when this is the only device', async () => {
    await mount([device('a', { current: true })]);

    expect(screen.queryByRole('button', { name: 'Sign out everywhere else' })).toBeNull();
  });

  it('shows five devices and the rest on request', async () => {
    await mount(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => device(id)));

    expect(screen.getAllByLabelText(/Details for/)).toHaveLength(5);

    fireEvent.click(screen.getByText('Show all 7 devices'));

    expect(screen.getAllByLabelText(/Details for/)).toHaveLength(7);
  });
});
