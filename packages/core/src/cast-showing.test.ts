import { CastReceiver } from '@kromatv/client/cast';
import { describe, expect, it } from 'vitest';
import { castShowing, castShownTitle, castShowsEpisode } from './cast-showing';

const SALON = {
  id: 'tv-salon-01',
  name: 'Salon',
  platform: 'Tizen',
  username: 'owner',
  network: 'LAN',
};

const WATCHING = {
  watch: {
    mount: '/api/module/tv.example.swarm',
    id: 'f13348a88094f2e1',
    file: 1,
    title: 'Kaamelott',
    season: 1,
    episode: 2,
  },
  positionMs: 31_000,
  state: 'playing',
};

describe('what a television shows', () => {
  it('is the watch download it reports', () => {
    const receiver = CastReceiver.parse({ ...SALON, nowWatching: WATCHING });

    expect(castShowing(receiver)).toMatchObject({ positionMs: 31_000, state: 'playing' });
  });

  it('is nothing on an idle set', () => {
    expect(castShowing(CastReceiver.parse(SALON))).toBeNull();
  });
});

describe('how a remote names a watch download', () => {
  it('names the show and the episode', () => {
    const showing = castShowing(CastReceiver.parse({ ...SALON, nowWatching: WATCHING }));

    expect(showing && castShownTitle(showing)).toBe('Kaamelott · S01E02');
    expect(showing && castShowsEpisode(showing)).toBe(true);
  });

  it('names a film by its title alone', () => {
    const film = { ...WATCHING, watch: { ...WATCHING.watch, season: null, episode: null } };
    const showing = castShowing(CastReceiver.parse({ ...SALON, nowWatching: film }));

    expect(showing && castShownTitle(showing)).toBe('Kaamelott');
    expect(showing && castShowsEpisode(showing)).toBe(false);
  });
});
