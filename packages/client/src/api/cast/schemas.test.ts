import { describe, expect, it } from 'vitest';
import { CastCommand, CastPlaybackReport, CastReceiver } from './schemas';

const EPISODE_TWO = {
  mount: '/api/module/tv.example.swarm',
  id: 'f13348a88094f2e1',
  file: 1,
  title: 'Kaamelott',
  tmdbId: 11466,
  season: 1,
  episode: 2,
};

const SALON = {
  id: 'tv-salon-01',
  name: 'Salon',
  platform: 'Tizen',
  username: 'owner',
  network: 'LAN',
};

describe('a cast of a watch download', () => {
  it('orders a television to play one file of a download', () => {
    const command = { type: 'watch', watch: EPISODE_TWO, positionMs: 30_000 };

    expect(CastCommand.parse(command)).toEqual(command);
  });

  it('reads a set playing a watch download beside its now-playing slot', () => {
    const row = {
      ...SALON,
      nowWatching: { watch: EPISODE_TWO, positionMs: 31_000, durationMs: 70_000, state: 'playing' },
    };

    const parsed = CastReceiver.parse(row);

    expect(parsed.nowWatching?.watch.id).toBe('f13348a88094f2e1');
    expect(parsed.nowPlaying).toBeUndefined();
  });

  it('lets a television report the download it plays', () => {
    const report = { watch: EPISODE_TWO, positionMs: 1_000, state: 'playing' };

    expect(CastPlaybackReport.safeParse(report).success).toBe(true);
  });

  it('refuses a report that names a title and a download at once', () => {
    const both = { itemId: 'it1', watch: EPISODE_TWO, positionMs: 1_000, state: 'playing' };

    expect(CastPlaybackReport.safeParse(both).success).toBe(false);
  });
});
