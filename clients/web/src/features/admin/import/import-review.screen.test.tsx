// @vitest-environment jsdom

import {
  ImportServer,
  ImportServerId,
  ImportSignInId,
  ImportSurvey,
} from '@kromatv/client/importers';
import { ModuleId } from '@kromatv/client/modules';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({ survey: vi.fn(), forget: vi.fn() }));
const imports = vi.hoisted(() => ({ folders: vi.fn(), start: vi.fn() }));
const library = vi.hoisted(() => ({ browse: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ importers, imports, library });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { sessionNow, settle, showImport } from './import-flow.fixture';
import { ImportReview } from './import-review.component';

const IMPORTER = ModuleId.parse('tv.test.other');
const SIGN_IN = ImportSignInId.parse(crypto.randomUUID());
const TARGET = { importer: IMPORTER, signIn: SIGN_IN, server: ImportServerId.parse('den') };
const SEED = { ...TARGET, servers: [ImportServer.parse({ id: 'den', name: 'The den' })] };

function surveyOf(over: Partial<ImportSurvey> = {}) {
  return ImportSurvey.parse({
    libraries: [
      { id: 'films', name: 'Films', kind: 'movies', folders: ['/data/films'] },
      { id: 'shows', name: 'Shows', kind: 'shows', folders: ['/data/shows'] },
    ],
    users: [
      {
        id: 'ada',
        name: 'Ada',
        signedIn: false,
        allLibraries: true,
        libraries: [],
        finerLimits: [],
        stateLocked: false,
      },
    ],
    counts: { titles: 1200, states: 40 },
    leftBehind: ['passwords', 'zines'],
    ...over,
  });
}

const FOUND = {
  folders: [{ folder: '/data/films', here: '/volume1/films' }, { folder: '/data/shows' }],
};

async function review() {
  showImport(<ImportReview target={TARGET} onBack={() => {}} />, SEED);
  await settle();
  await settle();
}

beforeEach(() => {
  importers.survey.mockResolvedValue(surveyOf());
  imports.folders.mockResolvedValue(FOUND);
  imports.start.mockResolvedValue({ id: 'run-1' });
  library.browse.mockRejectedValue(new Error('offline'));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the review of what comes over', () => {
  it('counts what the other server holds, and says what was not counted', async () => {
    await review();

    expect(screen.getByText('1,200')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('–')).toBeTruthy();
  });

  it('names what does not come over, in its own words where KROMA has none', async () => {
    await review();

    expect(screen.getByText('What does not come over')).toBeTruthy();
    expect(screen.getByText('passwords (each person chooses a new one) · zines')).toBeTruthy();
  });

  it('says where each folder is here, and which one was not found', async () => {
    await review();

    expect(screen.getByText('On this server: /volume1/films')).toBeTruthy();
    expect(screen.getByText('Not found on this server. Choose where it is.')).toBeTruthy();
  });

  it('keeps where the owner says a folder is', async () => {
    await review();

    fireEvent.click(screen.getByLabelText('/data/films'));
    await settle();
    fireEvent.click(screen.getByLabelText('Use this folder'));
    await settle();

    expect(sessionNow().folders).toEqual([{ folder: '/data/films', here: '/volume1/films' }]);
    expect(screen.queryByLabelText('Use this folder')).toBeNull();
  });

  it('closes the folder browser when the owner gives up', async () => {
    await review();

    fireEvent.click(screen.getByLabelText('/data/shows'));
    await settle();
    fireEvent.click(screen.getByLabelText('Cancel'));
    await settle();

    expect(screen.queryByLabelText('Use this folder')).toBeNull();
    expect(sessionNow().folders).toEqual([]);
  });

  it('asks for no folder when no library it brings has one', async () => {
    importers.survey.mockResolvedValue(
      surveyOf({ libraries: [{ id: 'music', name: 'Music', kind: 'other', folders: ['/m'] }] }),
    );
    await review();

    expect(imports.folders).not.toHaveBeenCalled();
    expect(screen.queryByText('Folders')).toBeNull();
  });
});

describe('starting the import', () => {
  it('starts it with what the owner kept, and follows it', async () => {
    await review();

    fireEvent.click(screen.getByLabelText('Start the import'));
    await settle();

    expect(imports.start).toHaveBeenCalledWith(
      expect.objectContaining({ importer: IMPORTER, server: { id: 'den', name: 'The den' } }),
    );
    expect(sessionNow().running).toBe('run-1');
  });

  it('says so when the import could not start', async () => {
    imports.start.mockRejectedValue(new Error('busy'));
    await review();

    fireEvent.click(screen.getByLabelText('Start the import'));
    await settle();

    expect(screen.getByText('The import could not start. Try again.')).toBeTruthy();
    expect(sessionNow().running).toBeNull();
  });

  it('cannot start before the other server answered', async () => {
    importers.survey.mockReturnValue(new Promise(() => {}));
    await review();

    expect(screen.getByLabelText('Start the import').getAttribute('aria-disabled')).toBe('true');
  });

  it('says so when the other server could not be read', async () => {
    importers.survey.mockRejectedValue(new Error('gone'));
    await review();

    expect(
      screen.getByText('KROMA could not read what this server holds. Go back and sign in again.'),
    ).toBeTruthy();
  });
});
