// The NATIVE playback backend (Apple TV, Android TV): expo-video.
//
// The browser targets have three engines to choose between (a bare <video> plus
// hls.js, Samsung's AVPlay plane, mpv on the desktop shell) because each is the
// only way to reach a particular decoder
// from inside a WebView. A native app has no such problem: expo-video IS the
// platform player (AVPlayer on tvOS, Media3/ExoPlayer on Android TV), so this
// backend is one engine and the decision collapses to "direct-play the original
// file, or ask the server to remux it".
//
// See backend.web.ts for the browser half. The hook that drives playback
// (useDirectPlayback) imports from './backend' and never learns which it got.

import { type KromaClient, type MediaItem, nativeDirectPlayable, type PlayEnv } from '@kroma/core';
import type { AudioFilterMode } from '@kroma/ui';
import { Platform } from 'react-native';
import type { EnginePref } from '#tv/app/enginePref';
import type { EngineListeners, Surface, TvEngine } from '#tv/features/playback/player/engine';
import { ExpoVideoEngine } from '#tv/features/playback/player/expoVideoEngine';

// The video surface an engine renders to. Natively there is only one: a
// <VideoView> that sits in the tree like any other view, which is why the chrome
// can transform it into the settings card exactly as it does an in-page video.
export type { Surface };

export type Engine = 'expo-direct' | 'expo-remux';

/** The resolved backend plan for an item. Only what the SHARED hook reads is
 * declared here; anything a backend needs purely for its own `createTvEngine`
 * stays private to that backend's plan (the browser half carries five engines'
 * worth of flags this one has no counterpart for). */
export interface EnginePlan {
  eng: Engine;
  surface: Surface;
  /** Heartbeat playback mode reported to the server. */
  playbackMode: 'direct' | 'remux' | 'transcode';
  /** Human label for the admin dashboard. */
  deviceLabel: string;
  /** Changes whenever any decision in this plan changes, so the hook can rebuild
   * the engine on exactly that and nothing else. */
  rebuildKey: string;
}

/**
 * Direct-play or remux.
 *
 * `nativeDirectPlayable` asks whether THIS platform's player can open the
 * ORIGINAL file - container, video codec and audio codec. When it says no, the
 * server's remux-only pipeline repackages the file (video is always
 * stream-copied) and we play that instead.
 *
 * It takes the OS because the two native players disagree about containers, and
 * the guess is not free. This used to ask `avplayDirectPlayable`, which answers
 * for Samsung's AVPlay: that demuxes Matroska, AVFoundation does not, so every
 * MKV on Apple TV opened a player that was certain to fail, waited for it to say
 * "Cannot Open", and only then asked the server - two seconds of black screen
 * per title, and a released-player race in expo-video behind it.
 *
 * The engine preference is honoured only where it is meaningful: `remux` forces
 * the server path even for a file the device could have opened directly. The
 * browser-only prefs (avplay / mpv / webview) have no native
 * counterpart and fall through to the automatic decision.
 */
export function planEngine(item: MediaItem, _env: PlayEnv, pref: EnginePref): EnginePlan {
  const os = Platform.OS === 'ios' ? 'ios' : 'android';
  const direct = pref !== 'remux' && nativeDirectPlayable(item, os);
  const eng: Engine = direct ? 'expo-direct' : 'expo-remux';
  return {
    eng,
    surface: 'video',
    // The native players decode AC-3 / E-AC-3, so the server's master is
    // stream-copied and the audio is never re-encoded (never 'transcode').
    playbackMode: direct ? 'direct' : 'remux',
    // A native build knows what it is running on; there is no user-agent to
    // sniff (and no `navigator` at all), which is why this used to report a
    // bare 'TV' for both devices.
    deviceLabel: os === 'ios' ? 'Apple TV' : 'Android TV',
    // `direct` is the only decision here, and `eng` already encodes it.
    rebuildKey: eng,
  };
}

/** Build the backend for a resolved plan. Always succeeds: unlike the web
 * `<video>` path there is no element to wait for, the player owns its surface -
 * which is also why `dom` is ignored here. */
export function createTvEngine(args: {
  plan: EnginePlan;
  client: KromaClient;
  item: MediaItem;
  durationSec: number;
  rendition: number;
  startSec: number;
  audioFilter: AudioFilterMode;
  /** The browser half's surface handle + native-HLS capability. A native player
   * owns its own surface and never reads this. */
  dom: { video: HTMLVideoElement | null; nativeHls: boolean | undefined };
  listeners: EngineListeners;
}): TvEngine | null {
  return new ExpoVideoEngine({
    client: args.client,
    item: args.item,
    durationSec: args.durationSec,
    initialRendition: args.rendition,
    startSec: args.startSec,
    direct: args.plan.eng === 'expo-direct',
    audioFilter: args.audioFilter,
    listeners: args.listeners,
  });
}
