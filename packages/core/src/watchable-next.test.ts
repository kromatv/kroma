import type { DiscoverEpisode, DiscoverSeason } from '@kromatv/client/discovery';
import type { WatchableFile } from '@kromatv/client/watchable';
import { describe, expect, it } from 'vitest';
import { target } from './react/watch.fixture';
import type { WatchableTarget } from './watchable';
import { type WatchShowGuide, watchFollowing, watchGuideGap } from './watchable-next';

const NOW = new Date(2026, 8, 24);

function episodeFile(index: number, season: number, episode: number): WatchableFile {
  return {
    index,
    name: `Kaamelott.S0${season}E0${episode}.mkv`,
    sizeBytes: 1_000 + index,
    isVideo: true,
    season,
    episode,
  };
}

const E1 = episodeFile(0, 1, 1);
const E2 = episodeFile(1, 1, 2);

function show(files: WatchableFile[], playing: WatchableFile): WatchableTarget {
  const film = target();
  return {
    entry: { ...film.entry, kind: 'show', title: 'Kaamelott', tmdbId: 11466, files },
    file: playing,
  };
}

function listed(episode: number, airDate: string | null = '2005-01-03'): DiscoverEpisode {
  return {
    episode,
    title: `Episode ${episode}`,
    overview: null,
    stillUrl: `/still/${episode}.jpg`,
    airDate,
    runtimeMin: 4,
  };
}

function season(number: number): DiscoverSeason {
  return {
    season: number,
    name: null,
    episodeCount: 6,
    airDate: null,
    available: false,
    episodesAvailable: 0,
    requested: false,
  };
}

function guide(
  episodes: Record<number, DiscoverEpisode[]>,
  seasons: number[] | null = null,
): WatchShowGuide {
  return {
    episodes: new Map(Object.entries(episodes).map(([n, list]) => [Number(n), list])),
    show: seasons ? { title: 'Kaamelott', seasons: seasons.map(season) } : null,
  };
}

describe('the episodes after the one playing', () => {
  it('plays the next episode from the same download when the pack holds it', () => {
    const playing = show([E1, E2], E1);

    const [next] = watchFollowing(playing, guide({ 1: [listed(1), listed(2), listed(3)] }), NOW);

    expect(next).toMatchObject({
      season: 1,
      episode: 2,
      title: 'Episode 2',
      stillUrl: '/still/2.jpg',
    });
    expect(next?.subject).toEqual({ kind: 'download', downloadId: playing.entry.id, file: 1 });
  });

  it('starts the next episode through the watch route when the pack ends before it', () => {
    const playing = show([E1, E2], E2);

    const [next] = watchFollowing(playing, guide({ 1: [listed(1), listed(2), listed(3)] }), NOW);

    expect(next?.subject).toEqual({
      kind: 'title',
      title: { tmdbId: 11466, kind: 'show', title: 'Kaamelott', year: 2010, season: 1, episode: 3 },
    });
  });

  it('moves to the first episode of the next season once this one is over', () => {
    const playing = show([E1, E2], E2);
    const known = guide({ 1: [listed(1), listed(2)], 2: [listed(1), listed(2)] }, [1, 2]);

    const [next] = watchFollowing(playing, known, NOW);

    expect(next).toMatchObject({ season: 2, episode: 1 });
  });

  it('never offers an episode that has not aired yet', () => {
    const playing = show([E1, E2], E2);

    const following = watchFollowing(
      playing,
      guide({ 1: [listed(1), listed(2), listed(3, '2027-01-01')] }, [1]),
      NOW,
    );

    expect(following).toEqual([]);
  });

  it('follows the download alone before TMDB has answered', () => {
    const playing = show([E1, E2], E1);

    const following = watchFollowing(playing, guide({}), NOW);

    expect(following.map(({ episode, title }) => ({ episode, title }))).toEqual([
      { episode: 2, title: null },
    ]);
  });

  it('offers nothing after a film', () => {
    expect(watchFollowing(target(), guide({ 1: [listed(2)] }), NOW)).toEqual([]);
  });
});

describe('what the guide still has to read', () => {
  it('asks for the season playing first', () => {
    expect(watchGuideGap(show([E1, E2], E1), guide({}), NOW)).toEqual({
      kind: 'season',
      season: 1,
    });
  });

  it('asks for the show once the season playing is over', () => {
    const playing = show([E1, E2], E2);

    expect(watchGuideGap(playing, guide({ 1: [listed(1), listed(2)] }), NOW)).toEqual({
      kind: 'show',
    });
  });

  it('asks for the next season once the show says there is one', () => {
    const playing = show([E1, E2], E2);

    expect(watchGuideGap(playing, guide({ 1: [listed(1), listed(2)] }, [1, 2]), NOW)).toEqual({
      kind: 'season',
      season: 2,
    });
  });

  it('asks for nothing while this season still has an episode to offer', () => {
    const playing = show([E1, E2], E1);

    expect(watchGuideGap(playing, guide({ 1: [listed(1), listed(2)] }), NOW)).toBeNull();
  });

  it('asks for nothing for a film', () => {
    expect(watchGuideGap(target(), guide({}), NOW)).toBeNull();
  });
});
