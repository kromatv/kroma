import { fakeClient } from '@kromatv/client/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeListeners, movie } from './engine.fixture';
import { ExpoVideoEngine } from './expo-video-engine';
import { type FakeVideoPlayer, players } from './expo-video.fixture';

vi.mock('expo-video', async () => {
  const { fakeCreateVideoPlayer } = await import('./expo-video.fixture');
  return { createVideoPlayer: fakeCreateVideoPlayer };
});

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const item = movie('vid1');

const GONE = { message: 'A playback exception has occurred: Source error Response code: 404' };
const EXPIRED = { message: 'A playback exception has occurred: Source error Response code: 401' };
const CUT_OFF = { message: 'The player failed: PLAYER_ERROR_CONNECTION_FAILED' };

function engineOn(opts: { renewed?: string } = {}) {
  const hlsMasterUrl = vi.fn((_id: string, _aac = false, startSec = 0) => `master@${startSec}`);
  const client = fakeClient({ media: { hlsMasterUrl, streamUrl: () => 'stream' } });
  const refreshSession = vi.fn(() => Promise.resolve(opts.renewed));
  Object.assign(client, { refreshSession });
  const listeners = fakeListeners();
  const engine = new ExpoVideoEngine({
    client,
    item,
    durationSec: 360,
    initialRendition: 0,
    startSec: 79,
    direct: false,
    listeners,
  });
  const player = players.at(-1);
  if (!player) {
    throw new Error('expected the engine to have opened a player');
  }
  return { engine, player, refreshSession, listeners };
}

function playingAt(player: FakeVideoPlayer, streamSec: number) {
  player.emit('playingChange', { isPlaying: true });
  player.emit('timeUpdate', { currentTime: streamSec });
}

function fails(player: FakeVideoPlayer, error: unknown) {
  player.emit('statusChange', { status: 'error', error });
}

beforeEach(() => {
  players.length = 0;
});

describe('ExpoVideoEngine when the server has let the stream go', () => {
  it('picks up where the picture stopped', () => {
    const { player } = engineOn();
    playingAt(player, 186);

    fails(player, GONE);

    expect(player.replaced).toEqual(['master@265']);
  });

  it('plays on from there', () => {
    const { player } = engineOn();
    playingAt(player, 186);
    const plays = player.plays;

    fails(player, GONE);

    expect(player.plays).toBe(plays + 1);
  });

  it('calls the stream broken once two restarts have not got it playing', () => {
    const { player, listeners } = engineOn();
    playingAt(player, 186);

    fails(player, GONE);
    fails(player, GONE);
    fails(player, GONE);

    expect(player.replaced).toHaveLength(2);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
  });

  it('owes its two restarts again once the picture plays', () => {
    const { player, listeners } = engineOn();
    playingAt(player, 186);
    fails(player, GONE);
    fails(player, GONE);

    player.emit('playingChange', { isPlaying: true });
    fails(player, GONE);

    expect(player.replaced).toHaveLength(3);
    expect(listeners.onError).not.toHaveBeenCalled();
  });

  it('keeps a paused film paused through the restart', () => {
    const { engine, player } = engineOn();
    playingAt(player, 186);
    engine.pause();
    const plays = player.plays;

    fails(player, GONE);

    expect(player.replaced).toEqual(['master@265']);
    expect(player.plays).toBe(plays);
  });

  it('restarts a stream that stopped mid-film without naming why', () => {
    const { player } = engineOn();
    playingAt(player, 41);

    fails(player, CUT_OFF);

    expect(player.replaced).toEqual(['master@120']);
  });

  it('spends its second restart on a restart that fails without naming why', () => {
    const { player, listeners } = engineOn();
    playingAt(player, 186);

    fails(player, GONE);
    fails(player, CUT_OFF);
    fails(player, CUT_OFF);

    expect(player.replaced).toEqual(['master@265', 'master@265']);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
  });

  it('restarts where the picture stopped however late the old source reports its time', () => {
    const { player } = engineOn();
    playingAt(player, 186);
    fails(player, GONE);

    player.emit('timeUpdate', { currentTime: 187 });
    fails(player, GONE);

    expect(player.replaced).toEqual(['master@265', 'master@265']);
  });

  it('leaves a title that never played to the fallback', () => {
    const { player, listeners } = engineOn();

    fails(player, CUT_OFF);

    expect(player.replaced).toEqual([]);
    expect(listeners.onError).toHaveBeenCalledTimes(1);
  });
});

describe('ExpoVideoEngine when the server refuses the credential', () => {
  it('renews the session and picks up where the picture stopped', async () => {
    const { player, refreshSession } = engineOn({ renewed: 'fresh' });
    playingAt(player, 21);

    fails(player, EXPIRED);

    await vi.waitFor(() => expect(player.replaced).toEqual(['master@100']));
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('calls the stream broken when the session cannot be renewed', async () => {
    const { player, listeners } = engineOn();
    playingAt(player, 21);

    fails(player, EXPIRED);

    await vi.waitFor(() => expect(listeners.onError).toHaveBeenCalledTimes(1));
    expect(player.replaced).toEqual([]);
  });

  it('does nothing with a renewal that lands after the player closed', async () => {
    const { engine, player, refreshSession, listeners } = engineOn({ renewed: 'fresh' });
    playingAt(player, 21);
    fails(player, EXPIRED);

    engine.destroy();
    await refreshSession.mock.results[0]?.value;

    expect(player.replaced).toEqual([]);
    expect(listeners.onError).not.toHaveBeenCalled();
  });
});
