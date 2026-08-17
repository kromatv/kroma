import type { ContinueItem, KromaClient, MediaItem, Section } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildHomeChannels,
  buildWatchNext,
  type HomeChannelSpec,
  type WatchNextItem,
} from '#tv/shared/launcher/cards';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

function fakeClient(backdrop: string | null = 'http://s/back.jpg'): KromaClient {
  return {
    baseUrl: 'http://s',
    backdropFor: vi.fn(() => backdrop),
  } as unknown as KromaClient;
}

function movie(over: Record<string, unknown> = {}): MediaItem {
  return {
    id: 'itm_1',
    title: 'Dune',
    year: 2021,
    kind: 'movie',
    addedAt: '2026-01-01',
    ...over,
  } as unknown as MediaItem;
}

function movieSection(id: string, title: string, items: MediaItem[]): Section {
  return { id, title, items: items.map((item) => ({ type: 'movie', item })) } as unknown as Section;
}

describe('buildHomeChannels', () => {
  it('mirrors the generic rows in a fixed order with their movies', () => {
    const sections = [
      movieSection('for-you', 'For you', [movie({ id: 'a', title: 'A' })]),
      movieSection('recent', 'Recently added', [movie({ id: 'b', title: 'B', year: null })]),
    ];
    const channels = buildHomeChannels(sections, fakeClient());
    expect(channels).toEqual([
      { title: 'Recently added', items: [expect.objectContaining({ id: 'b', subtitle: '' })] },
      { title: 'For you', items: [expect.objectContaining({ id: 'a', subtitle: '2021' })] },
    ]);
  });

  it('builds a movie program with card art, backdrop and the year subtitle', () => {
    const channel = buildHomeChannels(
      [movieSection('recent', 'Recently added', [movie({ id: 'x y', addedAt: '2026-02-02' })])],
      fakeClient(),
    )[0] as HomeChannelSpec;
    expect(channel.items[0]).toEqual({
      id: 'x y',
      title: 'Dune',
      subtitle: '2021',
      imageUrl: 'http://s/api/items/x%20y/card?v=2026-02-02',
      backdropUrl: 'http://s/back.jpg',
      kind: 'movie',
    });
  });

  it('drops the backdrop when the client has none', () => {
    const channel = buildHomeChannels(
      [movieSection('recent', 'Recently added', [movie()])],
      fakeClient(null),
    )[0] as HomeChannelSpec;
    expect(channel.items[0]?.backdropUrl).toBeUndefined();
  });

  it('keeps movies only, de-duplicates ids and caps at twenty', () => {
    const many = Array.from({ length: 25 }, (_, i) => movie({ id: `m${i}` }));
    const section = movieSection('recent', 'Recently added', [movie({ id: 'dup' }), ...many]);
    section.items.push({ type: 'movie', item: movie({ id: 'dup' }) } as Section['items'][number]);
    section.items.push({ type: 'show', show: { id: 'sh' } } as unknown as Section['items'][number]);
    const channel = buildHomeChannels([section], fakeClient())[0] as HomeChannelSpec;
    expect(channel.items).toHaveLength(20);
    expect(channel.items.filter((p) => p.id === 'dup')).toHaveLength(1);
  });

  it('skips a row with no movie programs', () => {
    const section = {
      id: 'recent',
      title: 'Recently added',
      items: [{ type: 'show', show: { id: 's' } }],
    } as unknown as Section;
    expect(buildHomeChannels([section], fakeClient())).toEqual([]);
  });

  it('ignores rows outside the generic set', () => {
    const sections = [movieSection('themed-halloween', 'Spooky', [movie()])];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(buildHomeChannels(sections, fakeClient())).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('no generic home rows'),
      expect.anything(),
    );
  });

  it('stays quiet when there are no sections at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(buildHomeChannels([], fakeClient())).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

function resume(
  over: Record<string, unknown> = {},
  item: Record<string, unknown> = {},
): ContinueItem {
  return {
    item: movie({ kind: 'movie', ...item }),
    positionMs: 1000.4,
    durationMs: 4000,
    updatedAt: '2026-03-03T00:00:00Z',
    ...over,
  } as unknown as ContinueItem;
}

describe('buildWatchNext', () => {
  it('maps a movie into a resume tile with a progress-stamped card', () => {
    const tile = buildWatchNext([resume()], fakeClient())[0] as WatchNextItem;
    expect(tile).toEqual({
      id: 'itm_1',
      title: 'Dune',
      subtitle: '2021',
      imageUrl: 'http://s/api/items/itm_1/card?label=Reprendre&v=2026-01-01&progress=0.250',
      backdropUrl: 'http://s/back.jpg',
      showId: undefined,
      progressMs: 1000,
      durationMs: 4000,
      kind: 'movie',
      updatedAtMs: Date.parse('2026-03-03T00:00:00Z'),
    });
  });

  it('prefers the show title and episode title, and links the episode to its show', () => {
    const tile = buildWatchNext(
      [resume({}, { showTitle: 'Show', episodeTitle: 'Pilot', showId: 'sh_9', kind: 'episode' })],
      fakeClient(null),
    )[0] as WatchNextItem;
    expect(tile).toMatchObject({
      title: 'Show',
      subtitle: 'Pilot',
      showId: 'sh_9',
      kind: 'episode',
    });
    expect(tile.backdropUrl).toBeUndefined();
  });

  it('omits the progress parameter and zeroes duration when there is no duration', () => {
    const tile = buildWatchNext(
      [resume({ durationMs: null, positionMs: 0 })],
      fakeClient(),
    )[0] as WatchNextItem;
    expect(tile.imageUrl).toBe('http://s/api/items/itm_1/card?label=Reprendre&v=2026-01-01');
    expect(tile.durationMs).toBe(0);
  });

  it('falls back to an empty subtitle when there is neither episode nor year', () => {
    const tile = buildWatchNext([resume({}, { year: null })], fakeClient())[0] as WatchNextItem;
    expect(tile.subtitle).toBe('');
  });

  it('stamps the current time when the update timestamp is unparseable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T00:00:00Z'));
    const tile = buildWatchNext(
      [resume({ updatedAt: 'not-a-date' })],
      fakeClient(),
    )[0] as WatchNextItem;
    expect(tile.updatedAtMs).toBe(Date.parse('2026-05-05T00:00:00Z'));
    vi.useRealTimers();
  });
});
