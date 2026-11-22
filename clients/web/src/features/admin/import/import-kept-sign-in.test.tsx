// @vitest-environment jsdom

import { ImportSignInId } from '@kromatv/client/importers';
import { ModuleId } from '@kromatv/client/modules';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({ forget: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ importers });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { KeptSignIn } from './import-kept-sign-in.component';
import { ImportSession, useImportSession } from './import-session.component';

const inputHost = createInputTestHost();
const PLEX = ModuleId.parse('tv.test.plex');
const KEPT = ImportSignInId.parse(crypto.randomUUID());
const SETTLE_MS = 20;

function SignedIn() {
  const { session, update } = useImportSession();
  useEffect(() => update({ importer: PLEX, signIn: KEPT }), [update]);
  return (
    <>
      <KeptSignIn />
      {session.signIn ? null : <span>Signed out</span>}
    </>
  );
}

function show() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  inputHost.render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="en">
        <ImportSession>
          <SignedIn />
        </ImportSession>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, SETTLE_MS));
  });
}

beforeEach(() => {
  importers.forget.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('a sign-in KROMA keeps', () => {
  it('says that it is kept', async () => {
    show();
    await settle();

    expect(screen.getByText('KROMA keeps this sign-in to run the import again.')).toBeTruthy();
  });

  it('is forgotten by the importer, and the import starts over', async () => {
    show();
    await settle();

    fireEvent.click(screen.getByLabelText('Forget this sign-in'));
    await settle();

    expect(importers.forget).toHaveBeenCalledWith(PLEX, KEPT);
    expect(screen.getByText('Signed out')).toBeTruthy();
  });

  it('says so when the importer could not forget it', async () => {
    importers.forget.mockRejectedValue(new Error('down'));
    show();
    await settle();

    fireEvent.click(screen.getByLabelText('Forget this sign-in'));
    await settle();

    expect(screen.getByText('KROMA could not forget this sign-in. Try again.')).toBeTruthy();
    expect(screen.queryByText('Signed out')).toBeNull();
  });
});
