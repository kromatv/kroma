// @vitest-environment jsdom

import type { WatchableApi, WatchableEntry } from '@kromatv/client/watchable';
import { I18nProvider } from '@kromatv/ui';
import { renderHook } from '@testing-library/react';
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => {
  const list = vi.fn();
  const refresh = vi.fn();
  return {
    list,
    refresh,
    go: vi.fn(),
    mounted: true,
    entries: [] as WatchableEntry[],
  };
});

vi.mock('#tv/app/providers/watchable', () => ({
  useWatchable: () => ({
    api: api.mounted ? ({ list: api.list } as unknown as WatchableApi) : null,
    entries: api.entries,
    refresh: api.refresh,
  }),
}));
vi.mock('#tv/app/router', () => ({
  useClient: () => ({ media: { artwork: { resolve: () => '/art.jpg' } } }),
  useNav: () => ({ go: api.go }),
}));

import { FILE, TARGET } from '@kromatv/core/test';
import { useWatchCards } from '#tv/features/catalog/home/watchRow';

const ENTRY = TARGET.entry;

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <I18nProvider locale="en">{children}</I18nProvider>
);

const cards = () => renderHook(useWatchCards, { wrapper }).result;

beforeEach(() => {
  vi.clearAllMocks();
  api.mounted = true;
  api.entries = [ENTRY];
});

describe('the rail of what is arriving', () => {
  it('draws one card per download the server can already play', () => {
    const result = cards();

    expect(result.current?.cards).toHaveLength(1);
    expect(result.current?.title).toBe('Watch now');
  });

  it('draws nothing where the server answers the capability with nothing', () => {
    api.mounted = false;

    const result = cards();

    expect(result.current).toBeNull();
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it('draws nothing while the server has nothing arriving', () => {
    api.entries = [];

    const result = cards();

    expect(result.current).toBeNull();
  });

  it('leaves out a download whose file list the swarm has not answered with', () => {
    api.entries = [{ ...ENTRY, files: [] }];

    const result = cards();

    expect(result.current).toBeNull();
  });

  it('asks the listing again while the home is on screen', () => {
    vi.useFakeTimers();

    cards();
    vi.advanceTimersByTime(25_000);

    expect(api.refresh.mock.calls.length).toBeGreaterThan(2);
    vi.useRealTimers();
  });

  it('opens the file the download is watched for, at the index the torrent gave it', () => {
    const result = cards();
    const card = result.current?.cards[0];

    if (isValidElement<{ onPress: () => void }>(card)) card.props.onPress();

    expect(api.go).toHaveBeenCalledWith('watch', {
      subject: { kind: 'download', downloadId: ENTRY.id, file: FILE.index },
      poster: ENTRY.posterUrl,
    });
  });
});
