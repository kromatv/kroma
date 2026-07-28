// The native playback backend (Apple TV, Android TV).
//
// The browser targets pick between three engines because each is the only way to
// reach a particular decoder from inside a WebView. A native app has no such
// problem - expo-video IS the platform player - so the whole decision collapses
// to "open the original file, or ask the server to remux it".
//
// Which makes the ONE question it does ask worth pinning: it must be asked of
// the right platform. This used to call `avplayDirectPlayable`, which answers
// for Samsung's AVPlay. AVPlay demuxes Matroska and AVFoundation does not, so
// every MKV on Apple TV opened a player that was certain to fail, waited for it
// to report "Cannot Open", and only then asked the server: two seconds of black
// screen per title, with a released-player race in expo-video behind it.
//
// The other half of that story is the label. A native build knows what it is
// running on - there is no user-agent to sniff, and no `navigator` at all -
// which is why the admin dashboard used to show a bare 'TV' for both devices.

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
    // AVFoundation and Media3 disagree about containers, and answering for the
    // wrong one costs two seconds of black screen per title.
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
    // stream-copied either way. A 'transcode' heartbeat here would be a lie to
    // the admin dashboard.
    for (const answer of [true, false]) {
      nativeDirectPlayable.mockReturnValue(answer);
      expect(plan().playbackMode).not.toBe('transcode');
    }
  });
});

describe('the engine preference', () => {
  it('is honoured where it is meaningful: remux forces the server path', () => {
    nativeDirectPlayable.mockReturnValue(true);
    // Even for a file this device could have opened directly.
    expect(plan('remux')).toMatchObject({ eng: 'expo-remux', playbackMode: 'remux' });
  });

  it('does not even ask when remux is forced', () => {
    plan('remux');
    expect(nativeDirectPlayable).not.toHaveBeenCalled();
  });

  it('ignores the browser-only prefs, which have no native counterpart', () => {
    nativeDirectPlayable.mockReturnValue(true);
    for (const pref of ['auto', 'avplay', 'webview', 'mpv'] as EnginePref[]) {
      // Falling through to the automatic decision, rather than to some default.
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
    // A <VideoView> that sits in the tree like any other view, which is what
    // lets the chrome transform it into the settings card.
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

    // And on nothing else: the hook rebuilds the engine when this changes, and
    // a rebuild mid-film is a black frame and a re-seek.
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
    // Unlike the web <video> path there is no element to wait for, which is also
    // why `dom` is ignored here.
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
