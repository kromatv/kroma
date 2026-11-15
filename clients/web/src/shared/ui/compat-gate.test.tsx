// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppIdentity } from '@kromatv/client';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';
import { CompatGate } from './compat-gate';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HEALTH = { status: 'ok', ffprobe: true, libraries: 0, items: 0, shows: 0 };

function mount(app: AppIdentity | undefined, health: { version: string; minClient?: string }) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ ...HEALTH, ...health }), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const runtime = { ...createWebTestRuntime({}), app };
  render(
    <QueryClientProvider client={runtime.queryClient}>
      <WebRuntimeProvider value={runtime}>
        <I18nProvider locale="en">
          <CompatGate>
            <span>the routes</span>
          </CompatGate>
        </I18nProvider>
      </WebRuntimeProvider>
    </QueryClientProvider>,
  );
}

describe('CompatGate', () => {
  it('replaces the routes with one screen when the server no longer serves this build', async () => {
    mount({ shell: 'web', version: '0.1.38' }, { version: '0.1.40', minClient: '0.1.39' });

    expect(await screen.findByText('This app needs an update')).toBeTruthy();
    expect(screen.queryByText('the routes')).toBeNull();
    expect(screen.getByText(/server 0\.1\.40/)).toBeTruthy();
  });

  it('shows the routes to a build the server still serves', async () => {
    mount({ shell: 'web', version: '0.1.39' }, { version: '0.1.40', minClient: '0.1.39' });

    expect(screen.getByText('the routes')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('the routes')).toBeTruthy();
  });

  it('shows the routes when the server predates saying which apps it serves', async () => {
    mount({ shell: 'web', version: '0.1.38' }, { version: '0.1.38' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('the routes')).toBeTruthy();
  });

  it('never asks when the build cannot name its own version', async () => {
    mount(undefined, { version: '0.1.40', minClient: '0.1.39' });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('the routes')).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
