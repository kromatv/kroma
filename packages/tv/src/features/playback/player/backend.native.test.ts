// The native playback backend (Apple TV, Android TV): expo-video is the platform
// player, so the only decision is direct playback versus a server remux.

import type { MediaItem, PlayEnv } from '@kroma/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnginePref } from '#tv/app/enginePref';

const rn = vi.hoisted(() => ({ os: 'ios' as 'ios' | 'android' }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
    },
  },
}));

const nativeDirectPlayable = vi.hoisted(() => vi.fn(() => true));
vi.mock('@kroma/core', () => ({ nativeDirectPlayable }));

const built = vi.hoisted(() => ({ args: [] as unknown[] }));
vi.mock('#tv/features/playback/player/expoVideoEngine', () => ({
  ExpoVideoEngine: class {
    constructor(args: unknown) {
      built.args.push(args);
    }
  },
}));

import { createTvEngine, planEngine } from './backend';

const item = { id: 'itm_1' } as MediaItem;
const env = {} as PlayEnv;

const plan = (pref: EnginePref = 'auto') => planEngine(item, env, pref);

beforeEach(() => {
  rn.os = 'ios';
  built.args = [];
  nativeDirectPlayable.mockReset();
  nativeDirectPlayable.mockReturnValue(true);
});

describe('the one question it asks', () => {
  it('asks about THIS platform’s player, not a television’s', () => {
    rn.os = 'ios';
    plan();
    // AVFoundation and Media3 disagree about containers: AVPlay demuxes Matroska,
    // AVFoundation does not.
    expect(nativeDirectPlayable).toHaveBeenCalledWith(item, 'ios');

    rn.os = 'android';
    plan();
    expect(nativeDirectPlayable).toHaveBeenLastCalledWith(item, 'android');
  });

  it('opens the original file when the player can', () => {
    nativeDirectPlayable.mockReturnValue(true);
    expect(plan()).toMatchObject({ eng: 'expo-direct', playbackMode: 'direct' });
  });

  it('asks the server to remux when it cannot', () => {
    nativeDirectPlayable.mockReturnValue(false);
    expect(plan()).toMatchObject({ eng: 'expo-remux', playbackMode: 'remux' });
  });

  it('never reports a transcode, because the audio is never re-encoded', () => {
    // The native players decode AC-3 / E-AC-3, so the server's master is
    // stream-copied either way.
    for (const answer of [true, false]) {
      nativeDirectPlayable.mockReturnValue(answer);
      expect(plan().playbackMode).not.toBe('transcode');
    }
  });
});

describe('the engine preference', () => {
  it('is honoured where it is meaningful: remux forces the server path', () => {
    nativeDirectPlayable.mockReturnValue(true);
    expect(plan('remux')).toMatchObject({ eng: 'expo-remux', playbackMode: 'remux' });
  });

  it('does not even ask when remux is forced', () => {
    plan('remux');
    expect(nativeDirectPlayable).not.toHaveBeenCalled();
  });

  it('ignores the browser-only prefs, which have no native counterpart', () => {
    nativeDirectPlayable.mockReturnValue(true);
    for (const pref of ['auto', 'avplay', 'webview', 'mpv'] as EnginePref[]) {
      expect(plan(pref).eng).toBe('expo-direct');
    }
  });
});

describe('what the plan reports', () => {
  it('names the device it is actually running on', () => {
    rn.os = 'ios';
    expect(plan().deviceLabel).toBe('Apple TV');
    rn.os = 'android';
    expect(plan().deviceLabel).toBe('Android TV');
  });

  it('always renders to the one native surface', () => {
    nativeDirectPlayable.mockReturnValue(false);
    expect(plan().surface).toBe('video');
    nativeDirectPlayable.mockReturnValue(true);
    expect(plan().surface).toBe('video');
  });

  it('changes the rebuild key on exactly the one decision it makes', () => {
    nativeDirectPlayable.mockReturnValue(true);
    const direct = plan().rebuildKey;
    nativeDirectPlayable.mockReturnValue(false);
    const remux = plan().rebuildKey;
    expect(direct).not.toBe(remux);

    // And on nothing else: a rebuild mid-film is a black frame and a re-seek.
    rn.os = 'android';
    expect(plan().rebuildKey).toBe(remux);
  });
});

describe('building the engine', () => {
  const args = (eng: 'expo-direct' | 'expo-remux') => ({
    plan: {
      eng,
      surface: 'video',
      playbackMode: 'direct',
      deviceLabel: 'Apple TV',
      rebuildKey: eng,
    } as const,
    client: {} as never,
    item,
    durationSec: 1200,
    rendition: 2,
    startSec: 40,
    audioFilter: 'off' as never,
    dom: { video: null, nativeHls: undefined },
    listeners: {} as never,
  });

  it('always succeeds: the player owns its own surface', () => {
    expect(createTvEngine(args('expo-direct'))).not.toBeNull();
  });

  it('passes the plan’s decision through as the engine’s mode', () => {
    createTvEngine(args('expo-direct'));
    expect(built.args.at(-1)).toMatchObject({ direct: true });

    createTvEngine(args('expo-remux'));
    expect(built.args.at(-1)).toMatchObject({ direct: false });
  });

  it('hands the engine where to start and what to start with', () => {
    createTvEngine(args('expo-direct'));
    expect(built.args.at(-1)).toMatchObject({
      item,
      durationSec: 1200,
      initialRendition: 2,
      startSec: 40,
    });
  });
});
