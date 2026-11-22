// @vitest-environment jsdom

import { ImporterList } from '@kromatv/client/importers';
import { StorePlan } from '@kromatv/client/modules';
import { I18nProvider } from '@kromatv/ui';
import { GuidedFlow } from '@kromatv/ui/kit';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({ list: vi.fn(), forget: vi.fn() }));
const store = vi.hoisted(() => ({
  fetchInstallPlan: vi.fn(),
  installById: vi.fn(),
  fetchAdminModules: vi.fn(),
}));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const base = createWebTestRuntime({ importers });
  const runtime = { ...base, moduleApi: { ...base.moduleApi, ...store } };
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { ImportSession } from './import-session.component';
import { ImportStep } from './import-step.component';

const inputHost = createInputTestHost();
const PLEX = 'tv.test.plex';

const OFFERED = ImporterList.parse({
  importers: [{ id: PLEX, name: 'Plex', installed: false, running: false, fields: [] }],
});

const PLAN = StorePlan.parse({
  requested: PLEX,
  modules: [
    {
      id: PLEX,
      name: 'Plex',
      version: '0.1.0',
      size: 2_000_000,
      requested: true,
      official: true,
      permissions: { net: { connect: [{ purpose: 'plex', to: ['public'] }] } },
    },
  ],
  optional: [],
  missing: [],
  totalSize: 2_000_000,
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  inputHost.render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="en">
        <ImportSession>
          <GuidedFlow.Root label="Import">
            <ImportStep onBack={() => {}} onContinue={() => {}} />
          </GuidedFlow.Root>
        </ImportSession>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const SETTLE_MS = 50;

async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, SETTLE_MS));
  });
}

async function choosePlex() {
  await settle();
  fireEvent.click(screen.getByLabelText('Plex'));
  await settle();
}

beforeEach(() => {
  importers.list.mockResolvedValue(OFFERED);
  store.fetchInstallPlan.mockResolvedValue(PLAN);
  store.fetchAdminModules.mockResolvedValue([]);
  store.installById.mockResolvedValue({ op: 'op', requested: PLEX, installed: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('choosing an importer the server does not hold', () => {
  it('shows what it will be able to do and installs nothing yet', async () => {
    show();

    await choosePlex();

    expect(screen.getByText('Install Plex')).toBeTruthy();
    expect(screen.getByText('What this module will be able to do')).toBeTruthy();
    expect(store.installById).not.toHaveBeenCalled();
  });

  it('installs it once the owner accepts what it will be able to do', async () => {
    show();
    await choosePlex();

    fireEvent.click(screen.getByLabelText('Install'));
    await settle();

    expect(store.installById).toHaveBeenCalledWith(PLEX, []);
  });
});
