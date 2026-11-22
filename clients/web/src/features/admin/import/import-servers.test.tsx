// @vitest-environment jsdom

import { ImportServer } from '@kromatv/client/importers';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({ forget: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ importers });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { sessionNow, settle, showImport } from './import-flow.fixture';
import { ImportServers } from './import-servers.component';

const SEED = {
  servers: [
    ImportServer.parse({ id: 'den', name: 'The den', address: 'https://den.test' }),
    ImportServer.parse({ id: 'attic', name: 'The attic' }),
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the choice of a server a sign-in reaches', () => {
  it('waits for the owner to choose one', async () => {
    showImport(<ImportServers onBack={() => {}} />, SEED);
    await settle();

    expect(screen.getByText('https://den.test')).toBeTruthy();
    expect(screen.getByLabelText('Continue').getAttribute('aria-disabled')).toBe('true');
  });

  it('brings the one the owner chose', async () => {
    showImport(<ImportServers onBack={() => {}} />, SEED);
    await settle();

    fireEvent.click(screen.getByRole('radio', { name: 'The attic' }));
    fireEvent.click(screen.getByLabelText('Continue'));
    await settle();

    expect(sessionNow().server).toBe('attic');
  });
});
