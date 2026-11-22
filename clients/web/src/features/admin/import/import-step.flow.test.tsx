// @vitest-environment jsdom

import {
  ImporterList,
  ImportServer,
  ImportServerId,
  ImportSignInId,
} from '@kromatv/client/importers';
import { ImportId } from '@kromatv/client/imports';
import { ModuleId } from '@kromatv/client/modules';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({
  list: vi.fn(),
  connect: vi.fn(),
  survey: vi.fn(),
  forget: vi.fn(),
}));
const imports = vi.hoisted(() => ({ get: vi.fn(), folders: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ importers, imports });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { sessionNow, settle, showImport } from './import-flow.fixture';
import type { ImportChoices } from './import-session.component';
import { ImportStep } from './import-step.component';

const PLEX = ModuleId.parse('tv.test.plex');
const KEPT = ImportSignInId.parse(crypto.randomUUID());
const DEN = ImportServerId.parse('den');
const DEN_ONLY = ImportServer.parse({ id: 'den', name: 'The den' });
const TWO = [DEN_ONLY, ImportServer.parse({ id: 'attic', name: 'The attic' })];

const RUNNING = ImporterList.parse({
  importers: [{ id: PLEX, name: 'Plex', installed: true, running: true, fields: [] }],
});

async function stepAt(seed: Partial<ImportChoices>) {
  showImport(<ImportStep onContinue={() => {}} />, seed);
  await settle();
  await settle();
}

beforeEach(() => {
  importers.list.mockResolvedValue(RUNNING);
  importers.connect.mockReturnValue(new Promise(() => {}));
  importers.survey.mockReturnValue(new Promise(() => {}));
  imports.get.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('where the import stands', () => {
  it('follows an import the owner started', async () => {
    await stepAt({ importer: PLEX, running: ImportId.parse(crypto.randomUUID()) });

    expect(screen.getByText('The import is running')).toBeTruthy();
  });

  it('signs in to a running importer the owner chose', async () => {
    await stepAt({ importer: PLEX });

    expect(screen.getByText('Sign in to Plex')).toBeTruthy();
  });

  it('asks which server, for a sign-in that reaches several', async () => {
    await stepAt({ importer: PLEX, signIn: KEPT, servers: TWO });

    expect(screen.getByText('Which server?')).toBeTruthy();
  });

  it('reviews the server the owner chose', async () => {
    await stepAt({ importer: PLEX, signIn: KEPT, servers: TWO, server: DEN });

    expect(screen.getByText('This is what comes over')).toBeTruthy();
  });

  it('goes back from the review to the choice of a server when there was one', async () => {
    await stepAt({ importer: PLEX, signIn: KEPT, servers: TWO, server: DEN });

    fireEvent.click(screen.getByLabelText('Back'));
    await settle();

    expect(sessionNow().server).toBeNull();
    expect(sessionNow().signIn).toBe(KEPT);
  });

  it('starts over from the review of the only server a sign-in reaches', async () => {
    await stepAt({ importer: PLEX, signIn: KEPT, servers: [DEN_ONLY], server: DEN });

    fireEvent.click(screen.getByLabelText('Back'));
    await settle();

    expect(sessionNow().importer).toBeNull();
  });
});
