import type { MediaItem } from '@kroma/core';
import type { PlayerController } from '@kroma/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCastCommand, type CastDeps } from '#tv/features/cast/applyCommand';
import { setCastTarget } from '#tv/features/cast/castBridge';

const item = (id: string) => ({ id, title: id }) as MediaItem;

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
} {
  return {
    client: {
      item: vi.fn(async (id: string) => item(id)),
      nextEpisode: vi.fn(async () => item('s01e02')),
    } as unknown as CastDeps['client'],
    nav: { reset: vi.fn(), swap: vi.fn(), home: vi.fn() },
  } as never;
}

beforeEach(() => setCastTarget(null));

describe('play', () => {
  it('launches the title with no history behind it', async () => {
    const d = deps();
    await applyCastCommand({ type: 'play', itemId: 'it1' as never, positionMs: 60_000 }, d);
    expect(d.nav.reset).toHaveBeenCalledWith('player', {
      item: expect.objectContaining({ id: 'it1' }),
    });
  });

  it('seeks instead of relaunching when the TV is already on that title', async () => {
    const c = controller({ playing: false });
    setCastTarget({ item: item('it1'), controller: c });
    const d = deps();
    await applyCastCommand({ type: 'play', itemId: 'it1' as never, positionMs: 30_000 }, d);
    // No remount (which would black the screen); just a seek + resume.
    expect(d.nav.reset).not.toHaveBeenCalled();
    expect(c.seekTo).toHaveBeenCalledWith(30);
    expect(c.togglePlay).toHaveBeenCalled();
  });

  it('does nothing when the title cannot be resolved', async () => {
    const d = deps();
    (d.client.item as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('404'));
    await applyCastCommand({ type: 'play', itemId: 'gone' as never }, d);
    expect(d.nav.reset).not.toHaveBeenCalled();
  });
});

describe('transport', () => {
  it('pause and resume respect what the player is already doing', async () => {
    const playing = controller({ playing: true });
    setCastTarget({ item: item('it1'), controller: playing });
    await applyCastCommand({ type: 'resume' }, deps());
    expect(playing.togglePlay).not.toHaveBeenCalled(); // already playing
    await applyCastCommand({ type: 'pause' }, deps());
    expect(playing.togglePlay).toHaveBeenCalledTimes(1);

    const paused = controller({ playing: false });
    setCastTarget({ item: item('it1'), controller: paused });
    await applyCastCommand({ type: 'pause' }, deps());
    expect(paused.togglePlay).not.toHaveBeenCalled(); // already paused
    await applyCastCommand({ type: 'resume' }, deps());
    expect(paused.togglePlay).toHaveBeenCalledTimes(1);
  });

  it('converts the wire milliseconds into the player seconds', async () => {
    const c = controller();
    setCastTarget({ item: item('it1'), controller: c });
    await applyCastCommand({ type: 'seek', positionMs: 90_000 }, deps());
    await applyCastCommand({ type: 'skip', deltaMs: -10_000 }, deps());
    expect(c.seekTo).toHaveBeenCalledWith(90);
    expect(c.skip).toHaveBeenCalledWith(-10);
  });

  it('selects tracks by the index the receiver itself advertised', async () => {
    const c = controller();
    setCastTarget({ item: item('it1'), controller: c });
    await applyCastCommand({ type: 'setAudio', index: 2 }, deps());
    await applyCastCommand({ type: 'setSubtitle', index: null }, deps());
    expect(c.setAudio).toHaveBeenCalledWith(2);
    expect(c.setSubtitle).toHaveBeenCalledWith(null);
  });
});

describe('skipNext / stop', () => {
  it('swaps in the next episode, keeping what is behind the player', async () => {
    setCastTarget({ item: item('s01e01'), controller: controller() });
    const d = deps();
    await applyCastCommand({ type: 'skipNext' }, d);
    expect(d.nav.swap).toHaveBeenCalledWith(
      'player',
      expect.objectContaining({ item: expect.objectContaining({ id: 's01e02' }) }),
    );
  });

  it('leaves the player alone when there is no next episode', async () => {
    setCastTarget({ item: item('film'), controller: controller() });
    const d = deps();
    (d.client.nextEpisode as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await applyCastCommand({ type: 'skipNext' }, d);
    expect(d.nav.swap).not.toHaveBeenCalled();
  });

  it('stop only leaves a player that is actually up', async () => {
    // Nothing playing: a stale stop must not yank the viewer out of a screen
    // they browsed to after the cast ended.
    const idle = deps();
    await applyCastCommand({ type: 'stop' }, idle);
    expect(idle.nav.home).not.toHaveBeenCalled();

    setCastTarget({ item: item('it1'), controller: controller() });
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
