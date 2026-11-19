// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const moduleApi = vi.hoisted(() => ({ installById: vi.fn(), uninstallModule: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const owned = createWebTestRuntime({});
  const runtime = { ...owned, moduleApi: { ...owned.moduleApi, ...moduleApi } };
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { OFFERS_QUERY } from './module-offers';
import { SetupPicks, useSetupPicks } from './setup-picks.component';
import { useInstallPicks } from './use-install-picks.hook';

let queries: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queries}>
      <SetupPicks>{children}</SetupPicks>
    </QueryClientProvider>
  );
}

function renderPicks() {
  return renderHook(() => ({ apply: useInstallPicks(), picks: useSetupPicks() }), { wrapper });
}

type Rendered = ReturnType<typeof renderPicks>['result'];

function choose(result: Rendered, { picked, dropped }: { picked: string[]; dropped: string[] }) {
  act(() => {
    result.current.picks.setPicked(picked);
    result.current.picks.setDropped(dropped);
  });
}

async function leaveTheSetup(result: Rendered) {
  await act(async () => {
    result.current.apply();
  });
}

const offersWereReadAgain = () => queries.getQueryState(OFFERS_QUERY)?.isInvalidated;

beforeEach(() => {
  queries = new QueryClient();
  queries.setQueryData(OFFERS_QUERY, { modules: [] });
  moduleApi.installById.mockReset().mockResolvedValue({});
  moduleApi.uninstallModule.mockReset().mockResolvedValue(undefined);
});

describe('before the owner leaves the setup', () => {
  it('installs and uninstalls nothing, so a choice stays a choice', () => {
    const { result } = renderPicks();

    choose(result, { picked: ['tv.test.subtitles'], dropped: ['tv.test.vpn'] });

    expect(moduleApi.installById).not.toHaveBeenCalled();
    expect(moduleApi.uninstallModule).not.toHaveBeenCalled();
  });
});

describe('when the owner leaves the setup', () => {
  it('installs every module the owner selected', async () => {
    const { result } = renderPicks();
    choose(result, { picked: ['tv.test.subtitles', 'tv.test.trailers'], dropped: [] });

    await leaveTheSetup(result);

    expect(moduleApi.installById.mock.calls).toEqual([['tv.test.subtitles'], ['tv.test.trailers']]);
  });

  it('uninstalls every module the owner deselected', async () => {
    const { result } = renderPicks();
    choose(result, { picked: [], dropped: ['tv.test.vpn'] });

    await leaveTheSetup(result);

    expect(moduleApi.uninstallModule.mock.calls).toEqual([['tv.test.vpn']]);
  });

  it('hands every choice over, so none stays selected or deselected', async () => {
    const { result } = renderPicks();
    choose(result, { picked: ['tv.test.subtitles'], dropped: ['tv.test.vpn'] });

    await leaveTheSetup(result);

    expect(result.current.picks).toMatchObject({
      picked: [],
      dropped: [],
      started: ['tv.test.subtitles'],
    });
  });

  it('takes back a module whose install failed, so that it can be selected again', async () => {
    moduleApi.installById.mockRejectedValue(new Error('registry offline'));
    const { result } = renderPicks();
    choose(result, { picked: ['tv.test.subtitles'], dropped: [] });

    await leaveTheSetup(result);

    expect(result.current.picks.started).toEqual([]);
  });

  it('reads the offers again once an install has ended', async () => {
    const { result } = renderPicks();
    choose(result, { picked: ['tv.test.subtitles'], dropped: [] });

    await leaveTheSetup(result);

    expect(offersWereReadAgain()).toBe(true);
  });

  it('reads the offers again after an uninstall the server refused', async () => {
    moduleApi.uninstallModule.mockRejectedValue(new Error('still needed'));
    const { result } = renderPicks();
    choose(result, { picked: [], dropped: ['tv.test.vpn'] });

    await leaveTheSetup(result);

    expect(offersWereReadAgain()).toBe(true);
  });

  it('leaves the offers alone when the owner chose nothing', async () => {
    const { result } = renderPicks();

    await leaveTheSetup(result);

    expect(offersWereReadAgain()).toBe(false);
  });
});
