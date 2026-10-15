// @vitest-environment jsdom
import type { KromaClient } from '@kromatv/client';
import type { Capabilities, CapabilitySource } from '@kromatv/client/capabilities';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from '../i18n';
import { useWatchSources } from './watch-source';

const t = createTranslator('en');

const TORRENTS: CapabilitySource = {
  mount: '/api/module/tv.kroma.torrents',
  label: 'Torrents',
  icon: 'magnet',
  figures: [],
  actions: [],
};

const USENET: CapabilitySource = {
  ...TORRENTS,
  mount: '/api/module/tv.kroma.usenet',
  label: 'Usenet',
};

function server(capabilities: Capabilities) {
  const on = vi.fn((mount: string) => ({ mount }));
  const client = {
    capabilities: { read: async () => capabilities },
    watchable: { on },
  } as unknown as KromaClient;
  return { on, client };
}

const offering = (...sources: CapabilitySource[]): Capabilities => ({
  watchable: { mount: sources[0]?.mount ?? '/m', sources },
});

describe('the ways a viewer may watch', () => {
  it('offers none and binds nothing until the map has been read', () => {
    const { client, on } = server(offering(TORRENTS));

    const { result } = renderHook(() => useWatchSources(client, t));

    expect(result.current).toMatchObject({ sources: [], source: null, api: undefined });
    expect(on).not.toHaveBeenCalled();
  });

  it('settles on the only source a server offers, with nothing to pick', async () => {
    const { client, on } = server(offering(TORRENTS));

    const { result } = renderHook(() => useWatchSources(client, t));

    await waitFor(() => expect(result.current.source?.label).toBe('Torrents'));
    expect(on).toHaveBeenCalledWith(TORRENTS.mount);
  });

  it('speaks to none of several until a viewer has picked one', async () => {
    const { client, on } = server(offering(TORRENTS, USENET));

    const { result } = renderHook(() => useWatchSources(client, t));

    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    expect(result.current).toMatchObject({ source: null, api: undefined });
    expect(on).not.toHaveBeenCalled();
  });

  it('binds the request surface to the source a viewer picks', async () => {
    const { client } = server(offering(TORRENTS, USENET));

    const { result } = renderHook(() => useWatchSources(client, t));
    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    act(() => result.current.choose(USENET.mount));

    expect(result.current.api).toEqual({ mount: USENET.mount });
  });

  it('keeps that surface across renders, so nothing driven by it starts twice', async () => {
    const { client } = server(offering(TORRENTS));

    const { result, rerender } = renderHook(() => useWatchSources(client, t));
    await waitFor(() => expect(result.current.api).toBeTruthy());
    const first = result.current.api;
    rerender();

    expect(result.current.api).toBe(first);
  });

  it('reads a capability that declares no source as one on its bare mount', async () => {
    const { client } = server({ watchable: { mount: '/api/module/tv.example.old' } });

    const { result } = renderHook(() => useWatchSources(client, t));

    await waitFor(() => expect(result.current.source?.mount).toBe('/api/module/tv.example.old'));
    expect(result.current.source?.label).toBe(t('requests.watchSourceDownload'));
  });

  it('offers nothing at all where the server answers the capability with none', async () => {
    const { client } = server({});

    const { result } = renderHook(() => useWatchSources(client, t));

    await waitFor(() => expect(result.current.api).toBeNull());
    expect(result.current.sources).toEqual([]);
  });
});
