// @vitest-environment jsdom

import { ImporterList } from '@kromatv/client/importers';
import { ImportList } from '@kromatv/client/imports';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost, layout } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({ list: vi.fn(), forget: vi.fn() }));
const imports = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ importers, imports });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { ImportPage } from './import-page.component';

const inputHost = createInputTestHost();
const PLEX = 'tv.test.plex';
const KEPT = crypto.randomUUID();
const SETTLE_MS = 20;

const OFFERED = ImporterList.parse({
  importers: [{ id: PLEX, name: 'Plex', installed: true, running: true, fields: [] }],
});

const STARTING = ImporterList.parse({
  importers: [{ id: PLEX, name: 'Plex', installed: true, running: false, fields: [] }],
});

function importOf(signIn?: string) {
  return {
    id: crypto.randomUUID(),
    importer: PLEX,
    server: { id: 'den', name: 'The den' },
    ...(signIn ? { signIn } : {}),
    status: 'completed',
    createdAt: 1,
    report: { libraries: {}, users: {}, titles: {}, states: {}, plays: {} },
    unmatchedTitles: 0,
  };
}

function show(locale: 'en' | 'fr' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  inputHost.render(
    <QueryClientProvider client={client}>
      <I18nProvider locale={locale}>
        <ImportPage />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, SETTLE_MS));
  });
}

function measureConsole(width: number) {
  const card = screen.getByRole('region', { name: 'Bring a server over' });
  const room = card.parentElement?.parentElement;
  if (!room) {
    throw new Error('the card sits in the console');
  }
  layout(room, { width });
}

beforeEach(() => {
  importers.list.mockResolvedValue(OFFERED);
  importers.forget.mockResolvedValue(undefined);
  imports.list.mockResolvedValue(ImportList.parse({ imports: [importOf(KEPT)] }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the import in the admin console', () => {
  it('opens on the choice of a server, with nothing to go back to and nothing to skip', async () => {
    show();
    await settle();

    expect(screen.getByText('Which server are you coming from?')).toBeTruthy();
    expect(screen.queryByLabelText('Back')).toBeNull();
    expect(screen.queryByLabelText('Skip this step')).toBeNull();
  });

  it('lists each sign-in an earlier import keeps, by the server it reaches', async () => {
    imports.list.mockResolvedValue(ImportList.parse({ imports: [importOf(KEPT), importOf()] }));
    show();
    await settle();

    expect(screen.getAllByText('The den')).toHaveLength(1);
  });

  it('speaks the language of the screen', async () => {
    show('fr');
    await settle();

    expect(screen.getByText('Migrer depuis un autre serveur')).toBeTruthy();
    expect(screen.getByText('Connexions gardées par KROMA')).toBeTruthy();
    expect(screen.getByLabelText('Oublier')).toBeTruthy();
  });

  it('says where the import stands: at the first of four stretches', async () => {
    show();
    await settle();

    measureConsole(1200);

    expect(
      screen.getByRole('tab', { name: 'Step 1 of 4: Server' }).getAttribute('aria-current'),
    ).toBe('step');
    expect(screen.getByRole('tab', { name: 'Step 4 of 4: Import' })).toBeTruthy();
  });

  it('marks the choice of a server done, under the name of the one chosen', async () => {
    importers.list.mockResolvedValue(STARTING);
    show();
    await settle();
    measureConsole(1200);

    fireEvent.click(screen.getByLabelText('Plex'));
    await settle();

    const behind = screen.getByRole('tab', { name: 'Step 1 of 4: Server, done' });
    expect(within(behind).getByText('Plex')).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'Step 2 of 4: Sign-in' }).getAttribute('aria-current'),
    ).toBe('step');
  });

  it('puts the stages beside the screen once the page has room for them', async () => {
    show();
    await settle();

    measureConsole(700);
    measureConsole(1200);

    expect(screen.getByRole('heading', { name: 'Import steps' })).toBeTruthy();
  });

  it('runs the stages over the screen where the page has no room beside it', async () => {
    show();
    await settle();

    measureConsole(700);

    expect(screen.queryByRole('heading', { name: 'Import steps' })).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Import steps' })).toBeTruthy();
  });

  it('says where it stands in one line on a page as narrow as a phone', async () => {
    show();
    await settle();

    measureConsole(400);

    expect(screen.queryByRole('tablist', { name: 'Import steps' })).toBeNull();
    expect(screen.getByText('Step 1 of 4: Server')).toBeTruthy();
  });

  it('forgets a kept sign-in in one press', async () => {
    show();
    await settle();

    fireEvent.click(screen.getByLabelText('Forget'));
    await settle();

    expect(importers.forget).toHaveBeenCalledWith(PLEX, KEPT);
  });
});
