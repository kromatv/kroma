// @vitest-environment jsdom

import { Importer, ImportSignIn } from '@kromatv/client/importers';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({ connect: vi.fn(), resume: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ importers });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { ImportConnect } from './import-connect.component';
import { settle, showImport } from './import-flow.fixture';

const PAGE = 'https://other.test/link';

function importerOf(over: Partial<Importer>) {
  return Importer.parse({
    id: 'tv.test.other',
    name: 'Other',
    installed: true,
    running: true,
    fields: [],
    ...over,
  });
}

const FORM = importerOf({
  label: 'Other server',
  fields: [{ key: 'address', label: 'Address', type: 'string', required: true }],
});
const PAGE_ONLY = importerOf({});

const PENDING = ImportSignIn.parse({ status: 'pending', pending: 'wait-1', url: PAGE });

function refused(message?: string) {
  return ImportSignIn.parse({ status: 'refused', reason: 'credentials', message });
}

async function connectWith(importer: Importer) {
  showImport(<ImportConnect importer={importer} onBack={() => {}} />);
  await settle();
}

beforeEach(() => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  importers.connect.mockResolvedValue(PENDING);
  importers.resume.mockResolvedValue(PENDING);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('the sign-in to the other server', () => {
  it('waits on an importer that is not running yet', async () => {
    await connectWith(importerOf({ running: false }));

    expect(screen.getByText('Starting the import module…')).toBeTruthy();
  });

  it('asks for the fields the importer declares, under its own name', async () => {
    await connectWith(FORM);

    expect(screen.getByText('Sign in to Other server')).toBeTruthy();
    expect(screen.getByLabelText('Sign in').getAttribute('aria-disabled')).toBe('true');
  });

  it('sends the page that server wants the owner on, once the form is sent', async () => {
    await connectWith(FORM);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://other.test' } });
    fireEvent.click(screen.getByLabelText('Sign in'));
    await settle();
    fireEvent.click(screen.getByLabelText('Open other.test'));

    expect(importers.connect).toHaveBeenCalledWith('tv.test.other', {
      address: 'https://other.test',
    });
    expect(screen.getByText('Finish the sign-in on other.test')).toBeTruthy();
    expect(window.open).toHaveBeenCalledWith(PAGE, '_blank', 'noopener');
  });

  it('says why the other server turned the form down, with its own words', async () => {
    importers.connect.mockResolvedValue(refused('401 from the server'));
    await connectWith(FORM);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://other.test' } });
    fireEvent.click(screen.getByLabelText('Sign in'));
    await settle();

    expect(screen.getByText('The name or the password is wrong.')).toBeTruthy();
    expect(screen.getByText('401 from the server')).toBeTruthy();
  });
});

describe('a sign-in on a page of the other server', () => {
  it('opens the page in one press and waits for the owner there', async () => {
    await connectWith(PAGE_ONLY);

    fireEvent.click(screen.getByLabelText('Sign in with Other'));
    await settle();

    expect(window.open).toHaveBeenCalledWith(PAGE, '_blank', 'noopener');
    expect(screen.getByLabelText('Open the page again')).toBeTruthy();
    expect(screen.getByText('You approve the sign-in there.')).toBeTruthy();
  });

  it('is not ready to open before the importer answered', async () => {
    importers.connect.mockReturnValue(new Promise(() => {}));
    await connectWith(PAGE_ONLY);

    fireEvent.click(screen.getByLabelText('Sign in with Other'));

    expect(window.open).not.toHaveBeenCalled();
  });

  it('starts again after a refusal, with the reason given alone', async () => {
    importers.connect.mockResolvedValue(refused());
    await connectWith(PAGE_ONLY);

    fireEvent.click(screen.getByLabelText('Try again'));
    await settle();

    expect(screen.getByText('The name or the password is wrong.')).toBeTruthy();
    expect(importers.connect).toHaveBeenCalledTimes(2);
  });
});
