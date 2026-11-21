// @vitest-environment jsdom
import { StoreCatalog } from '@kromatv/client/modules';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const moduleApi = vi.hoisted(() => ({ fetchStoreCatalog: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const owned = createWebTestRuntime({});
  const runtime = { ...owned, moduleApi: { ...owned.moduleApi, ...moduleApi } };
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { ModulesStep } from './modules-step.component';
import { SetupPicks } from './setup-picks.component';

const inputHost = createInputTestHost();

afterEach(cleanup);

const row = (id: string, words: Record<string, unknown>) => ({
  id,
  version: '1.0.0',
  library: false,
  dependencies: {},
  optionalDependencies: {},
  contributes: [],
  consumes: [],
  size: 2048,
  updateAvailable: false,
  compatible: true,
  source: 'Official',
  official: true,
  ...words,
});

const CATALOG = StoreCatalog.parse({
  schema: 2,
  serverVersion: '0.1.40',
  registryUrl: 'https://modules.kroma.tv/registry.json',
  registries: [],
  setup: ['tv.kroma.remote', 'tv.kroma.mdns'],
  modules: [
    row('tv.kroma.mdns', {
      name: 'mDNS discovery',
      description: 'mDNS advertising',
      permissions: { net: { discovery: ['mdns'] } },
    }),
    row('tv.kroma.remote', {
      name: 'Remote access',
      description: 'Public HTTPS access',
      tagline: 'Watch away from home.',
      translations: { fr: { name: 'Accès à distance', tagline: 'Regardez loin de chez vous.' } },
      permissions: { run: ['cloudflared'] },
    }),
    row('tv.kroma.roku', { name: 'Roku', description: 'Not offered' }),
  ],
});

function show(locale: 'en' | 'fr') {
  moduleApi.fetchStoreCatalog.mockResolvedValue(CATALOG);
  inputHost.render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider locale={locale}>
        <SetupPicks>
          <ModulesStep onBack={() => undefined} onContinue={() => undefined} />
        </SetupPicks>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

it('offers the modules the registry lists, in its order, each in its own words', async () => {
  show('fr');

  const remote = await screen.findByText('Accès à distance');
  const discovery = screen.getByText('mDNS discovery');

  expect(remote.compareDocumentPosition(discovery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText('Regardez loin de chez vous.')).toBeTruthy();
  expect(screen.getByText('mDNS advertising')).toBeTruthy();
  expect(screen.queryByText('Roku')).toBeNull();
});

it('names what each offer reaches', async () => {
  show('fr');

  expect(await screen.findByText(/^Accès à\s: Programmes lancés sur le serveur$/)).toBeTruthy();
  expect(screen.getByText(/^Accès à\s: Réseau local$/)).toBeTruthy();
});

it('reads a module in English where it speaks no other language', async () => {
  show('en');

  expect(await screen.findByText('Watch away from home.')).toBeTruthy();
  expect(screen.getByText('Access to: Local network')).toBeTruthy();
});
