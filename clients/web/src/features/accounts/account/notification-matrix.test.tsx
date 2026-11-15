// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';
import { NotificationMatrix } from './notification-matrix.component';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PREFS = {
  categories: [
    { category: 'requests', inApp: true, push: true },
    { category: 'downloads', inApp: true, push: false },
  ],
  types: [
    {
      type: 'request.created',
      category: 'requests',
      label: 'New request',
      inApp: true,
      push: true,
    },
    {
      type: 'request.declined',
      category: 'requests',
      label: 'Request declined',
      inApp: true,
      push: false,
    },
    {
      type: 'download.completed',
      category: 'downloads',
      label: 'Download complete',
      inApp: true,
      push: false,
    },
  ],
};

async function mount() {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(PREFS), { headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetch);
  const runtime = createWebTestRuntime({});
  render(
    <QueryClientProvider client={runtime.queryClient}>
      <WebRuntimeProvider value={runtime}>
        <I18nProvider locale="en">
          <NotificationMatrix />
        </I18nProvider>
      </WebRuntimeProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('Requests');
  return fetch;
}

const sent = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)));

const toggle = (group: string, channel: string) =>
  within(screen.getByRole('group', { name: group })).getByRole('button', { name: channel });

describe('NotificationMatrix', () => {
  it('lists each category with how many kinds it holds, and keeps the kinds closed', async () => {
    await mount();

    expect(screen.getByText('Downloads')).toBeTruthy();
    expect(screen.getByText('1 kind')).toBeTruthy();
    expect(screen.queryByText('New request')).toBeNull();
  });

  it('shows a category as what its kinds add up to on each channel', async () => {
    await mount();

    expect(toggle('Requests', 'In the app').getAttribute('aria-pressed')).toBe('true');
    expect(toggle('Requests', 'Push').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('2 kinds, set individually')).toBeTruthy();
    expect(toggle('Downloads', 'Push').getAttribute('aria-pressed')).toBe('false');
  });

  it('opens a category onto its kinds, each with its own toggles', async () => {
    await mount();

    fireEvent.click(screen.getByRole('button', { name: 'Requests: show each kind' }));

    expect(toggle('Request declined', 'Push').getAttribute('aria-pressed')).toBe('false');
    expect(toggle('New request', 'Push').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Download complete')).toBeNull();
  });

  it('moves a category and every kind under it with one press', async () => {
    const fetch = await mount();

    fireEvent.click(toggle('Requests', 'Push'));

    await waitFor(() =>
      expect(sent(fetch)).toEqual([
        {
          categories: [{ category: 'requests', inApp: true, push: true }],
          types: [
            { type: 'request.created', inApp: true, push: true },
            { type: 'request.declined', inApp: true, push: true },
          ],
        },
      ]),
    );
  });

  it('sends one kind with both of its toggles as they now stand', async () => {
    const fetch = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Requests: show each kind' }));

    fireEvent.click(toggle('Request declined', 'In the app'));

    await waitFor(() =>
      expect(sent(fetch)).toEqual([
        { types: [{ type: 'request.declined', inApp: false, push: false }] },
      ]),
    );
  });
});
