// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { KitProvider } from '@kromatv/ui/kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';

const clipboard = vi.hoisted(() => ({ copy: vi.fn(async () => true) }));

vi.mock('#web/shared/lib/copy-text', () => ({ copyText: clipboard.copy }));
vi.mock('#web/shared/ui/route-link.component', () => ({
  RouteLink: ({ to, children, ...props }: Readonly<{ to: string; children?: ReactNode }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { AboutHero } from './about-hero.component';
import { AppCard, ServerCard } from './build-cards.component';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clipboard.copy.mockClear();
});

const INFO = {
  version: '0.1.40',
  build: 3500000,
  commit: 'abc1234',
  commitFull: 'abc1234def',
  branch: 'main',
  dirty: false,
  buildDate: '2026-11-25T10:00:00Z',
  repository: 'https://github.com/kromatv/kroma',
};

const HEALTH = {
  status: 'ok',
  name: 'Den',
  version: '0.1.39',
  build: 3488516,
  commit: '74f8960',
  ffprobe: true,
  libraries: 3,
  items: 1200,
  shows: 80,
};

function respond(url: string): Response {
  if (url.endsWith('/api/health')) {
    return Response.json(HEALTH);
  }
  return Response.json({ texts: [], entries: [] });
}

async function mount() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => respond(url)),
  );
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <WebRuntimeProvider value={createWebTestRuntime({}, () => cache)}>
        <KitProvider config={{ entry: { physicalKeyboard: true } }}>
          <I18nProvider locale="en">
            <AboutHero info={INFO} />
            <ServerCard />
            <AppCard info={INFO} />
          </I18nProvider>
        </KitProvider>
      </WebRuntimeProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('Den');
}

describe('the About page', () => {
  it('names the server and the build it runs beside the build of this app', async () => {
    await mount();

    expect(screen.getByText('v0.1.39')).toBeTruthy();
    expect(screen.getByText('74f8960')).toBeTruthy();
    expect(screen.getByText('v0.1.40')).toBeTruthy();
    expect(screen.getByText('abc1234')).toBeTruthy();
  });

  it('links to the source code the app was built from', async () => {
    await mount();

    expect(screen.getByLabelText('Source code').getAttribute('href')).toBe(
      'https://github.com/kromatv/kroma',
    );
  });

  it('copies both versions for a bug report, and says so', async () => {
    await mount();

    fireEvent.click(screen.getByLabelText('Copy versions'));

    expect(await screen.findByLabelText('Copied')).toBeTruthy();
    expect(clipboard.copy).toHaveBeenCalledOnce();
  });
});
