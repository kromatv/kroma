// @vitest-environment jsdom

import type { Licenses } from '@kromatv/client/licenses';
import { I18nProvider } from '@kromatv/ui';
import { KitProvider } from '@kromatv/ui/kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';
import { LicensesCard } from './licenses-card.component';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SERVER: Licenses = {
  texts: ['MIT License text', 'Apache License text'],
  entries: [
    {
      kind: 'crate',
      name: 'serde',
      version: '1.0.228',
      license: 'MIT OR Apache-2.0',
      source: 'https://github.com/serde-rs/serde',
      texts: [0, 1],
    },
    { kind: 'crate', name: 'tokio', version: '1.48.0', license: 'MIT', source: null, texts: [0] },
  ],
};

const WEB: Licenses = {
  texts: [],
  entries: [
    { kind: 'npm', name: 'react', version: '19.2.0', license: 'MIT', source: null, texts: [] },
  ],
};

const TYPED = { entry: { physicalKeyboard: true } };

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

function answer(server: Response, web: Response) {
  return vi.fn(async (url: string) => (url.endsWith('/api/licenses') ? server : web));
}

async function mount(fetch: ReturnType<typeof answer>) {
  vi.stubGlobal('fetch', fetch);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const runtime = createWebTestRuntime({}, () => cache);
  render(
    <QueryClientProvider client={cache}>
      <WebRuntimeProvider value={runtime}>
        <KitProvider config={TYPED}>
          <I18nProvider locale="en">
            <LicensesCard />
          </I18nProvider>
        </KitProvider>
      </WebRuntimeProvider>
    </QueryClientProvider>,
  );
  await screen.findByText(/^\d+ packages?$/);
}

describe('LicensesCard', () => {
  it('lists what the server and this app ship, saying which one ships each', async () => {
    await mount(answer(json(SERVER), json(WEB)));

    expect(screen.getByText('3 packages')).toBeTruthy();
    expect(screen.getByText('MIT · Web')).toBeTruthy();
    expect(screen.getByText('MIT OR Apache-2.0 · Server')).toBeTruthy();
  });

  it('opens a package onto every text of its notice', async () => {
    await mount(answer(json(SERVER), json(WEB)));

    fireEvent.click(screen.getByLabelText('serde'));

    expect(screen.getByText('MIT License text')).toBeTruthy();
    expect(screen.getByText('Apache License text')).toBeTruthy();
  });

  it('links a package to its source, in a new tab', async () => {
    await mount(answer(json(SERVER), json(WEB)));

    fireEvent.click(screen.getByLabelText('serde'));

    const link = screen.getByLabelText('Source');
    expect([link.getAttribute('href'), link.getAttribute('target')]).toEqual([
      'https://github.com/serde-rs/serde',
      '_blank',
    ]);
  });

  it('keeps one package open at a time', async () => {
    await mount(answer(json(SERVER), json(WEB)));

    fireEvent.click(screen.getByLabelText('serde'));
    fireEvent.click(screen.getByLabelText('tokio'));

    expect(screen.queryByText('Apache License text')).toBeNull();
    expect(screen.getByLabelText('tokio').getAttribute('aria-expanded')).toBe('true');
  });

  it('says so when a package ships no text of its own', async () => {
    await mount(answer(json(SERVER), json(WEB)));

    fireEvent.click(screen.getByLabelText('react'));

    expect(screen.getByText(/ships no license text/)).toBeTruthy();
  });

  it('narrows the list to what the search matches', async () => {
    await mount(answer(json(SERVER), json(WEB)));

    fireEvent.change(screen.getByLabelText('Search packages'), { target: { value: 'apache' } });

    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.queryByLabelText('react')).toBeNull();
  });

  it("lists this app's packages when the server's cannot be read", async () => {
    await mount(answer(new Response('', { status: 500 }), json(WEB)));

    expect(screen.getByText('1 package')).toBeTruthy();
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
  });

  it('lists the server alone where this build carries no licenses file', async () => {
    await mount(answer(json(SERVER), new Response('<!doctype html>', { status: 200 })));

    expect(screen.getByText('2 packages')).toBeTruthy();
  });
});
