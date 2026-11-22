// @vitest-environment jsdom

import { Import, ImportId } from '@kromatv/client/imports';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const imports = vi.hoisted(() => ({ get: vi.fn() }));
const jobs = vi.hoisted(() => ({ cancel: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ imports, jobs });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { settle, showImport } from './import-flow.fixture';
import { ImportRun } from './import-run.component';

const RUN = ImportId.parse(crypto.randomUUID());
const NONE = { read: 0, brought: 0, unmatched: 0 };

function importOf(status: string) {
  return Import.parse({
    id: RUN,
    importer: 'tv.test.other',
    server: { id: 'den', name: 'The den' },
    status,
    createdAt: 1,
    report: {
      libraries: { read: 2, brought: 2, unmatched: 0 },
      users: NONE,
      titles: { read: 84, brought: 80, unmatched: 4 },
      states: NONE,
      plays: NONE,
    },
    unmatchedTitles: 4,
  });
}

async function run(onContinue = () => {}) {
  showImport(<ImportRun id={RUN} onContinue={onContinue} />);
  await settle();
}

beforeEach(() => {
  imports.get.mockResolvedValue(importOf('running'));
  jobs.cancel.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the import as it runs', () => {
  it('counts what it brought of what it read, kind by kind', async () => {
    await run();

    expect(screen.getByText('The import is running')).toBeTruthy();
    expect(screen.getByText('2 of 2')).toBeTruthy();
    expect(screen.getByText('80 of 84 · 4 unmatched')).toBeTruthy();
  });

  it('cancels the import job when the owner asks', async () => {
    await run();

    fireEvent.click(screen.getByLabelText('Cancel the import'));
    await settle();

    expect(jobs.cancel).toHaveBeenCalledWith('household.import');
  });

  it('says how it ended, and offers no cancel once it has', async () => {
    imports.get.mockResolvedValue(importOf('completed'));
    await run();

    expect(screen.getByText('The import is done')).toBeTruthy();
    expect(screen.queryByLabelText('Cancel the import')).toBeNull();
  });

  it('lets the owner go on while it runs', async () => {
    const onContinue = vi.fn();
    await run(onContinue);

    fireEvent.click(screen.getByLabelText('Continue'));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('says it is running before the server answered', async () => {
    imports.get.mockReturnValue(new Promise(() => {}));
    await run();

    expect(screen.getByText('The import is running')).toBeTruthy();
  });
});
