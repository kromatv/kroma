// The native playback backend (Apple TV, Android TV): expo-video is the
// platform player (AVPlayer on tvOS, Media3/ExoPlayer on Android TV), so
// this backend is one engine and the decision collapses to "direct-play the
// original file, or ask the server to remux it". See backend.web.ts for the
// browser half; the hook that drives playback never learns which it got.

import { type KromaClient, type MediaItem, nativeDirectPlayable, type PlayEnv } from '@kroma/core';
import type { AudioFilterMode } from '@kroma/ui';
import { Platform } from 'react-native';
import type { EnginePref } from '#tv/app/enginePref';
import type { EngineListeners, Surface, TvEngine } from '#tv/features/playback/player/engine';
import { ExpoVideoEngine } from '#tv/features/playback/player/expoVideoEngine';
import { VlcEngine } from '#tv/features/playback/player/vlcEngine';
import { vlcAvailable } from '#tv/features/playback/player/vlcPlane';

// The video surface an engine renders to. Natively there is only one: a
// <VideoView> that sits in the tree like any other view, which is why the chrome
// can transform it into the settings card exactly as it does an in-page video.
export type { Surface };

export type Engine = 'expo-direct' | 'expo-remux' | 'vlc';

/** The resolved backend plan for an item. Only what the SHARED hook reads is
 * declared here; anything a backend needs purely for its own `createTvEngine`
 * stays private to that backend's plan (the browser half carries five engines'
 * worth of flags this one has no counterpart for). */
export interface EnginePlan {
  eng: Engine;
  surface: Surface;
  playbackMode: 'direct' | 'remux' | 'transcode';
  deviceLabel: string;
  rebuildKey: string;
}

/**
 * Direct-play or remux. `nativeDirectPlayable` asks whether this platform's
 * player can open the original file (container, video codec, audio codec);
 * when it can't, the server's remux-only pipeline repackages it instead. It
 * takes the OS because the two native players disagree about containers
 * (AVFoundation has no Matroska demuxer, Media3 does).
 *
 * The engine preference is honoured only where meaningful: `remux` forces the
 * server path even for a file the device could open directly. The
 * browser-only prefs (avplay / mpv / webview) fall through to automatic.
 */
export function planEngine(item: MediaItem, _env: PlayEnv, pref: EnginePref): EnginePlan {
  const os = Platform.OS === 'ios' ? 'ios' : 'android';
  // VLC is asked for by name only. It carries its own decoders, so it always
  // takes the original file: routing it through the remux would spend the
  // server's CPU working around a limit this engine does not have.
  if (pref === 'vlc' && vlcAvailable()) {
    return {
      eng: 'vlc',
      surface: 'vlc',
      playbackMode: 'direct',
      deviceLabel: 'Android TV',
      rebuildKey: 'vlc',
    };
  }
  const direct = pref !== 'remux' && nativeDirectPlayable(item, os);
  const eng: Engine = direct ? 'expo-direct' : 'expo-remux';
  return {
    eng,
    surface: 'video',
    // The native players decode AC-3 / E-AC-3, so the server's master is
    // stream-copied and the audio is never re-encoded (never 'transcode').
    playbackMode: direct ? 'direct' : 'remux',
    // A native build knows what it is running on; there is no user-agent to
    // sniff (and no `navigator` at all).
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
  dom: { video: HTMLVideoElement | null; nativeHls: boolean | undefined };
  listeners: EngineListeners;
}): TvEngine | null {
  if (args.plan.eng === 'vlc') {
    return new VlcEngine({
      client: args.client,
      item: args.item,
      durationSec: args.durationSec,
      initialRendition: args.rendition,
      startSec: args.startSec,
      direct: true,
      audioFilter: args.audioFilter,
      listeners: args.listeners,
    });
  }
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
