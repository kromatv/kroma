// @vitest-environment jsdom

import { Importer, ImportSignIn } from '@kromatv/client/importers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({ connect: vi.fn(), resume: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ importers });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { ImportSession, useImportSession } from './import-session.component';
import {
  openPage,
  pendingOf,
  useImportPageSignIn,
  useImportSignIn,
} from './use-import-sign-in.hook';

const ASK_AGAIN_MS = 2000;
const NOTIFY_MS = 1;
const PAGE = 'https://other.test/link';
const KEPT = crypto.randomUUID();
const WAITING = crypto.randomUUID();
const FORM = { address: 'https://other.test', name: 'ada' };
const REFUSED = { status: 'refused', reason: 'other' };

const OTHER_SERVER = Importer.parse({
  id: 'tv.test.other-server',
  name: 'Other server',
  installed: true,
  running: true,
  fields: [],
});

function ready(...servers: string[]) {
  return ImportSignIn.parse({
    status: 'ready',
    signIn: KEPT,
    servers: servers.map((name) => ({ id: `server-${name}`, name })),
  });
}

const PENDING = ImportSignIn.parse({ status: 'pending', pending: WAITING, url: PAGE });

function wrapper() {
  const client = new QueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ImportSession>{children}</ImportSession>
    </QueryClientProvider>
  );
}

function renderFormSignIn() {
  return renderHook(
    () => ({ signIn: useImportSignIn(OTHER_SERVER), session: useImportSession().session }),
    { wrapper: wrapper() },
  );
}

function renderPageSignIn() {
  return renderHook(
    () => ({ signIn: useImportPageSignIn(OTHER_SERVER), session: useImportSession().session }),
    { wrapper: wrapper() },
  );
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function answered() {
  await elapse(NOTIFY_MS);
}

beforeEach(() => {
  importers.connect.mockReset();
  importers.resume.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the id to ask again with', () => {
  it('is the one a sign-in that waits on the owner gave', () => {
    expect(pendingOf(PENDING)).toBe(WAITING);
  });

  it('is none for a sign-in that is ready', () => {
    expect(pendingOf(ready('home'))).toBeNull();
  });

  it('is none before the other server answered', () => {
    expect(pendingOf(null)).toBeNull();
    expect(pendingOf(undefined)).toBeNull();
  });
});

describe('a page of the other server', () => {
  it('opens in a new tab that cannot reach this one', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openPage(PAGE);

    expect(open).toHaveBeenCalledWith(PAGE, '_blank', 'noopener');
  });
});

describe('a sign-in with the form of the importer', () => {
  it('has no answer before the owner sent the form', () => {
    const { result } = renderFormSignIn();

    expect(result.current.signIn).toMatchObject({ answer: null, busy: false });
    expect(importers.resume).not.toHaveBeenCalled();
  });

  it('sends what the owner filled to the importer', async () => {
    importers.connect.mockResolvedValue(ready('home'));
    const { result } = renderFormSignIn();

    await act(() => result.current.signIn.connect(FORM));

    expect(importers.connect).toHaveBeenCalledWith(OTHER_SERVER.id, FORM);
    expect(result.current.signIn).toMatchObject({ answer: ready('home'), busy: false });
  });

  it('keeps the owner waiting until the other server has answered', () => {
    importers.connect.mockReturnValue(new Promise(() => {}));
    const { result } = renderFormSignIn();

    act(() => {
      void result.current.signIn.connect(FORM);
    });

    expect(result.current.signIn.busy).toBe(true);
  });

  it('keeps the sign-in, and the server when it reaches only one', async () => {
    importers.connect.mockResolvedValue(ready('home'));
    const { result } = renderFormSignIn();

    await act(() => result.current.signIn.connect(FORM));

    expect(result.current.session).toMatchObject({
      signIn: KEPT,
      servers: [{ id: 'server-home', name: 'home' }],
      server: 'server-home',
    });
  });

  it('leaves the choice of the server to the owner when it reaches several', async () => {
    importers.connect.mockResolvedValue(ready('home', 'cabin'));
    const { result } = renderFormSignIn();

    await act(() => result.current.signIn.connect(FORM));

    expect(result.current.session).toMatchObject({ signIn: KEPT, server: null });
    expect(result.current.session.servers).toHaveLength(2);
  });

  it('keeps nothing of a sign-in the other server turned down', async () => {
    const refusal = { status: 'refused', reason: 'credentials' };
    importers.connect.mockResolvedValue(refusal);
    const { result } = renderFormSignIn();

    await act(() => result.current.signIn.connect(FORM));

    expect(result.current.signIn.answer).toEqual(refusal);
    expect(result.current.session.signIn).toBeNull();
  });

  it('reads an importer that did not answer as a sign-in turned down', async () => {
    importers.connect.mockRejectedValue(new Error('offline'));
    const { result } = renderFormSignIn();

    await act(() => result.current.signIn.connect(FORM));

    expect(result.current.signIn).toMatchObject({ answer: REFUSED, busy: false });
  });

  it('asks the importer again while the owner is on a page of the other server', async () => {
    importers.connect.mockResolvedValue(PENDING);
    importers.resume.mockResolvedValue(PENDING);
    const { result } = renderFormSignIn();
    await act(() => result.current.signIn.connect(FORM));
    await answered();

    await elapse(ASK_AGAIN_MS);

    expect(importers.resume.mock.calls).toEqual([
      [OTHER_SERVER.id, WAITING],
      [OTHER_SERVER.id, WAITING],
    ]);
    expect(result.current.signIn.answer).toEqual(PENDING);
  });

  it('keeps the sign-in once the owner is done on the other server', async () => {
    importers.connect.mockResolvedValue(PENDING);
    importers.resume.mockResolvedValueOnce(PENDING).mockResolvedValue(ready('home'));
    const { result } = renderFormSignIn();
    await act(() => result.current.signIn.connect(FORM));
    await answered();

    await elapse(ASK_AGAIN_MS);
    await answered();

    expect(result.current.signIn.answer).toEqual(ready('home'));
    expect(result.current.session).toMatchObject({ signIn: KEPT, server: 'server-home' });
  });

  it('asks the importer no more once the sign-in is ready', async () => {
    importers.connect.mockResolvedValue(PENDING);
    importers.resume.mockResolvedValue(ready('home'));
    const { result } = renderFormSignIn();
    await act(() => result.current.signIn.connect(FORM));
    await answered();

    await elapse(ASK_AGAIN_MS * 4);

    expect(importers.resume).toHaveBeenCalledOnce();
  });
});

describe('a sign-in on a page of the other server', () => {
  it('asks for the page as soon as the screen shows', () => {
    importers.connect.mockReturnValue(new Promise(() => {}));

    const { result } = renderPageSignIn();

    expect(importers.connect).toHaveBeenCalledWith(OTHER_SERVER.id, {});
    expect(result.current.signIn).toMatchObject({ answer: null, asking: true });
  });

  it('gives the page the owner opens', async () => {
    importers.connect.mockResolvedValue(PENDING);
    importers.resume.mockResolvedValue(PENDING);

    const { result } = renderPageSignIn();
    await answered();

    expect(result.current.signIn).toMatchObject({ answer: PENDING, asking: false });
  });

  it('reads an importer that gave no page as a sign-in turned down', async () => {
    importers.connect.mockRejectedValue(new Error('offline'));

    const { result } = renderPageSignIn();
    await answered();

    expect(result.current.signIn.answer).toEqual(REFUSED);
  });

  it('keeps the sign-in once the owner is done on the page', async () => {
    importers.connect.mockResolvedValue(PENDING);
    importers.resume.mockResolvedValueOnce(PENDING).mockResolvedValue(ready('home', 'cabin'));
    const { result } = renderPageSignIn();
    await answered();

    await elapse(ASK_AGAIN_MS);
    await answered();

    expect(result.current.signIn.answer).toEqual(ready('home', 'cabin'));
    expect(result.current.session).toMatchObject({ signIn: KEPT, server: null });
  });

  it('asks for a new page when the owner tries again', async () => {
    importers.connect.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(PENDING);
    importers.resume.mockResolvedValue(PENDING);
    const { result } = renderPageSignIn();
    await answered();

    act(() => result.current.signIn.again());
    await answered();

    expect(importers.connect).toHaveBeenCalledTimes(2);
    expect(result.current.signIn.answer).toEqual(PENDING);
  });
});
