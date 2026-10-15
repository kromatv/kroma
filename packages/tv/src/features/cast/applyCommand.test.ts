import { ItemId, type MediaItem } from '@kromatv/client/media';
import { DownloadId } from '@kromatv/client/watchable';
import type { PlayerController } from '@kromatv/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCastCommand, type CastDeps } from '#tv/features/cast/applyCommand';
import { setCastTarget } from '#tv/features/cast/castBridge';

const item = (id: string) => ({ id: ItemId.parse(id), title: id }) as MediaItem;

function controller(overrides: Partial<PlayerController> = {}) {
  return {
    playing: true,
    cur: 10,
    dur: 100,
    ready: true,
    waiting: false,
    audioTracks: [],
    audioIndex: 0,
    subtitles: [],
    subtitleIndex: null,
    togglePlay: vi.fn(),
    seekTo: vi.fn(),
    skip: vi.fn(),
    setAudio: vi.fn(),
    setSubtitle: vi.fn(),
    ...overrides,
  } as unknown as PlayerController;
}

function deps(): CastDeps & {
  nav: {
    reset: ReturnType<typeof vi.fn>;
    swap: ReturnType<typeof vi.fn>;
    home: ReturnType<typeof vi.fn>;
  };
  watchable: { choose: ReturnType<typeof vi.fn> };
} {
  return {
    client: {
      media: { item: vi.fn(async (id: string) => item(id)) },
      playback: { nextEpisode: vi.fn(async () => item('s01e02')) },
    } as unknown as CastDeps['client'],
    nav: { reset: vi.fn(), swap: vi.fn(), home: vi.fn() },
    watchable: { choose: vi.fn() },
  } as never;
}

const EPISODE_TWO = {
  mount: '/api/module/tv.example.swarm',
  id: DownloadId.parse('f13348a88094f2e1'),
  file: 1,
  title: 'Kaamelott',
  poster: 'https://image.tmdb.org/t/p/w500/k.jpg',
  season: 1,
  episode: 2,
};

beforeEach(() => setCastTarget(null));

describe('play', () => {
  it('launches the title with no history behind it', async () => {
    const d = deps();
    await applyCastCommand({ type: 'play', itemId: ItemId.parse('it1'), positionMs: 60_000 }, d);
    expect(d.nav.reset).toHaveBeenCalledWith('player', {
      item: expect.objectContaining({ id: 'it1' }),
    });
  });

  it('seeks instead of relaunching when the TV is already on that title', async () => {
    const c = controller({ playing: false });
    setCastTarget({ playing: { item: item('it1') }, controller: c });
    const d = deps();
    await applyCastCommand({ type: 'play', itemId: ItemId.parse('it1'), positionMs: 30_000 }, d);
    expect(d.nav.reset).not.toHaveBeenCalled();
    expect(c.seekTo).toHaveBeenCalledWith(30);
    expect(c.togglePlay).toHaveBeenCalled();
  });

  it('leaves a title that is already playing exactly where it is', async () => {
    const c = controller({ playing: true });
    setCastTarget({ playing: { item: item('it1') }, controller: c });
    const d = deps();
    await applyCastCommand({ type: 'play', itemId: ItemId.parse('it1') }, d);
    expect(c.seekTo).not.toHaveBeenCalled();
    expect(c.togglePlay).not.toHaveBeenCalled();
    expect(d.nav.reset).not.toHaveBeenCalled();
  });

  it('launches from the start when the sender named no position', async () => {
    const d = deps();
    await applyCastCommand({ type: 'play', itemId: ItemId.parse('it1') }, d);
    expect(d.nav.reset).toHaveBeenCalledWith('player', {
      item: expect.objectContaining({ id: 'it1' }),
    });
  });

  it('does nothing when the title cannot be resolved', async () => {
    const d = deps();
    (d.client.media.item as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('404'));
    await applyCastCommand({ type: 'play', itemId: ItemId.parse('gone') }, d);
    expect(d.nav.reset).not.toHaveBeenCalled();
  });
});

describe('transport', () => {
  it('pause and resume respect what the player is already doing', async () => {
    const playing = controller({ playing: true });
    setCastTarget({ playing: { item: item('it1') }, controller: playing });
    await applyCastCommand({ type: 'resume' }, deps());
    expect(playing.togglePlay).not.toHaveBeenCalled();
    await applyCastCommand({ type: 'pause' }, deps());
    expect(playing.togglePlay).toHaveBeenCalledTimes(1);

    const paused = controller({ playing: false });
    setCastTarget({ playing: { item: item('it1') }, controller: paused });
    await applyCastCommand({ type: 'pause' }, deps());
    expect(paused.togglePlay).not.toHaveBeenCalled();
    await applyCastCommand({ type: 'resume' }, deps());
    expect(paused.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('converts the wire milliseconds into the player seconds', async () => {
    const c = controller();
    setCastTarget({ playing: { item: item('it1') }, controller: c });
    await applyCastCommand({ type: 'seek', positionMs: 90_000 }, deps());
    await applyCastCommand({ type: 'skip', deltaMs: -10_000 }, deps());
    expect(c.seekTo).toHaveBeenCalledWith(90);
    expect(c.skip).toHaveBeenCalledWith(-10);
  });

  it('selects tracks by the index the receiver itself advertised', async () => {
    const c = controller();
    setCastTarget({ playing: { item: item('it1') }, controller: c });
    await applyCastCommand({ type: 'setAudio', index: 2 }, deps());
    await applyCastCommand({ type: 'setSubtitle', index: null }, deps());
    expect(c.setAudio).toHaveBeenCalledWith(2);
    expect(c.setSubtitle).toHaveBeenCalledWith(null);
  });
});

describe('skipNext / stop', () => {
  it('swaps in the next episode, keeping what is behind the player', async () => {
    setCastTarget({ playing: { item: item('s01e01') }, controller: controller() });
    const d = deps();
    await applyCastCommand({ type: 'skipNext' }, d);
    expect(d.nav.swap).toHaveBeenCalledWith(
      'player',
      expect.objectContaining({ item: expect.objectContaining({ id: 's01e02' }) }),
    );
  });

  it('leaves the player alone when there is no next episode', async () => {
    setCastTarget({ playing: { item: item('film') }, controller: controller() });
    const d = deps();
    (d.client.playback.nextEpisode as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await applyCastCommand({ type: 'skipNext' }, d);
    expect(d.nav.swap).not.toHaveBeenCalled();
  });

  it('stays on the current episode when the lookup fails', async () => {
    setCastTarget({ playing: { item: item('s01e01') }, controller: controller() });
    const d = deps();
    (d.client.playback.nextEpisode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('offline'),
    );
    await applyCastCommand({ type: 'skipNext' }, d);
    expect(d.nav.swap).not.toHaveBeenCalled();
  });

  it('stop only leaves a player that is actually up', async () => {
    const idle = deps();
    await applyCastCommand({ type: 'stop' }, idle);
    expect(idle.nav.home).not.toHaveBeenCalled();

    setCastTarget({ playing: { item: item('it1') }, controller: controller() });
    const playing = deps();
    await applyCastCommand({ type: 'stop' }, playing);
    expect(playing.nav.home).toHaveBeenCalled();
  });
});

describe('with no player mounted', () => {
  it('ignores transport orders instead of failing', async () => {
    const d = deps();
    for (const command of [
      { type: 'pause' },
      { type: 'resume' },
      { type: 'togglePlay' },
      { type: 'seek', positionMs: 1 },
      { type: 'skip', deltaMs: 1 },
      { type: 'setAudio', index: 0 },
      { type: 'setSubtitle', index: 1 },
      { type: 'skipNext' },
    ] as const) {
      await expect(applyCastCommand(command, d)).resolves.toBeUndefined();
    }
    expect(d.nav.swap).not.toHaveBeenCalled();
  });
});

describe('watch', () => {
  it('opens the watch screen on the file the cast names, at the mount it names', async () => {
    const d = deps();

    await applyCastCommand({ type: 'watch', watch: EPISODE_TWO, positionMs: 30_000 }, d);

    expect(d.watchable.choose).toHaveBeenCalledWith('/api/module/tv.example.swarm');
    expect(d.nav.reset).toHaveBeenCalledWith('watch', {
      subject: { kind: 'download', downloadId: EPISODE_TWO.id, file: 1 },
      poster: EPISODE_TWO.poster,
    });
  });

  it('carries on with a watch download already on screen instead of reopening it', async () => {
    const d = deps();
    const c = controller({ playing: false });
    setCastTarget({ playing: { watch: EPISODE_TWO, next: null }, controller: c });

    await applyCastCommand({ type: 'watch', watch: EPISODE_TWO, positionMs: 30_000 }, d);

    expect(c.seekTo).toHaveBeenCalledWith(30);
    expect(c.togglePlay).toHaveBeenCalled();
    expect(d.nav.reset).not.toHaveBeenCalled();
  });

  it('moves a watch download on to the episode its player offers next', async () => {
    const d = deps();
    const next = vi.fn();
    setCastTarget({ playing: { watch: EPISODE_TWO, next }, controller: controller() });

    await applyCastCommand({ type: 'skipNext' }, d);

    expect(next).toHaveBeenCalled();
    expect(d.client.playback.nextEpisode).not.toHaveBeenCalled();
  });
});
