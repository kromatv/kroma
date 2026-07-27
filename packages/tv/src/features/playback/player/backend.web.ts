// The WEB playback backend: which engine to build for an item on a browser
// target, and how to build it.
//
// Everything platform-specific about playback lives behind this module and its
// native sibling (backend.ts). The hook that drives playback (useDirectPlayback)
// imports `planEngine` and `createTvEngine` from './backend' and never learns
// which one it got: a bare <video> plus hls.js, Samsung's AVPlay plane, mpv on
// the desktop shell, or expo-video natively.

import {
  audioTracksOf,
  avplayDirectPlayable,
  canDirectPlay,
  type KromaClient,
  type MediaItem,
  NATIVE_TV_CAPS,
  type PlayEnv,
  selectEngine,
} from '@kroma/core';
import type { AudioFilterMode } from '@kroma/ui';
import { availableEngines, type EnginePref } from '#tv/app/enginePref';
import { AvplayEngine } from '#tv/features/playback/player/avplayEngine';
import {
  avplayAvailable,
  type EngineListeners,
  mpvAvailable,
  type Surface,
  type TvEngine,
} from '#tv/features/playback/player/engine';
import { HtmlEngine } from '#tv/features/playback/player/htmlEngine';
import { MpvEngine } from '#tv/features/playback/player/mpvEngine';

// The video surface an engine renders to. `video` is an in-tree element the
// chrome can transform; the others are planes behind a transparent page.
export type { Surface };

/** The concrete backend to build for this item. */
export type Engine = 'mpv' | 'avplay' | 'video-direct' | 'video-remux';

/** The backend the user explicitly asked for, or `null` when the pref is `auto` or
 * names an engine this platform can't run (e.g. `mpv` off the Linux shell,
 * `avplay` off Tizen) - both fall through to the automatic decision. */
function manualEngine(pref: EnginePref, tizenNative: boolean): Engine | null {
  if (pref === 'avplay' && tizenNative) return 'avplay';
  if (pref === 'webview') return 'video-direct';
  if (pref === 'remux') return 'video-remux';
  if (pref === 'mpv' && mpvAvailable()) return 'mpv';
  return null;
}

/** The automatic backend for this platform: native planes where they exist
 * (AVPlay on Tizen for hardware surround, mpv on the desktop shell), else
 * `<video>` direct-play or the server remux. */
function autoEngine(env: PlayEnv, tizenNative: boolean, autoDirect: boolean): Engine {
  if (tizenNative) return 'avplay';
  if (env.platform === 'desktop' && mpvAvailable()) return 'mpv';
  return autoDirect ? 'video-direct' : 'video-remux';
}

/** Resolve the backend from the user's engine preference, falling back to the
 * automatic decision. `auto` on Tizen keeps AVPlay (hardware surround), but the user
 * can force the HTML5 (`<video>` + hls.js) remux path instead. */
function resolveEngine(pref: EnginePref, env: PlayEnv, autoDirect: boolean): Engine {
  // A stored engine no longer offered on this platform (e.g. a device left on
  // `remux` after it was retired on Android TV, where the WebView cannot decode
  // HEVC) must not strand playback on a dead engine - degrade it to `auto`.
  const wanted = pref !== 'auto' && availableEngines().includes(pref) ? pref : 'auto';
  const tizenNative = env.platform === 'tizen' && avplayAvailable();
  return manualEngine(wanted, tizenNative) ?? autoEngine(env, tizenNative, autoDirect);
}

/** A plain, single-audio MP4 a bare TV `<video>` direct-plays natively. */
function tvDirectPlay(item: MediaItem): boolean {
  const container = (item.container ?? '').toLowerCase();
  if (container !== 'mp4' && container !== 'mov' && container !== 'm4v') return false;
  if (!canDirectPlay(item, NATIVE_TV_CAPS).canDirectPlay) return false;
  return audioTracksOf(item).length <= 1;
}

/** Container MIME the webview needs to demux a bare `<video src>`. */
const CONTAINER_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
};

/** Whether the webview can demux this item's container for a direct `<video src>`.
 * Safari / WKWebView has no Matroska (MKV) or AVI demuxer, so a forced direct-play
 * on one loads forever at HAVE_NOTHING with no error - callers fall back to the
 * server remux (which repackages it into a webview-playable stream) instead. */
function webviewCanDirectPlay(item: MediaItem): boolean {
  if (typeof document === 'undefined') return true;
  const mime = CONTAINER_MIME[(item.container ?? '').toLowerCase()];
  if (!mime) return false;
  return document.createElement('video').canPlayType(mime) !== '';
}

/** The resolved backend plan for an item: which engine + surface, the direct-play
 * flags, and the heartbeat playback mode. Pure (no React) so it stays out of the
 * hook body. */
export interface EnginePlan {
  eng: Engine;
  surface: Surface;
  useMpv: boolean;
  useAvplay: boolean;
  avplayDirect: boolean;
  direct: boolean;
  masterAac: boolean;
  playbackMode: 'direct' | 'remux' | 'transcode';
  /** Human label for the admin dashboard. */
  deviceLabel: string;
  /** Changes whenever any decision above changes, so the hook can rebuild the
   * engine on exactly that and nothing else. The flags above are this backend's
   * own business (the native half has no counterpart for any of them), so this
   * is what the SHARED hook depends on instead of listing them. */
  rebuildKey: string;
}

/** A human label for the current TV device (admin dashboard). Browser targets
 * have to sniff, because Tizen / webOS / a desktop shell are all "a Chromium". */
function deviceLabelFor(useMpv: boolean): string {
  if (useMpv) return 'Desktop';
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  if (/Tizen/i.test(ua)) return 'Samsung TV';
  if (/web0?s|LG/i.test(ua)) return 'LG TV';
  return 'TV';
}

/** mpv / AVPlay render to their own plane behind the transparent UI, so neither
 * uses an in-page media element. */
function surfaceFor(useMpv: boolean, useAvplay: boolean): Surface {
  if (useMpv) return 'mpv';
  if (useAvplay) return 'avplay';
  return 'video';
}

/** Video is always copied. AVPlay-direct plays the original file (direct);
 * AVPlay-master passes surround through (remux); only the hls.js AAC master
 * (webOS / MSE without AC3) re-encodes audio (transcode). */
function playbackModeFor(flags: {
  useMpv: boolean;
  useAvplay: boolean;
  avplayDirect: boolean;
  direct: boolean;
  aacMaster: boolean;
}): 'direct' | 'remux' | 'transcode' {
  const { useMpv, useAvplay, avplayDirect, direct, aacMaster } = flags;
  if (useMpv) return 'direct'; // mpv opens the original file (master only on fallback)
  if (useAvplay) return avplayDirect ? 'direct' : 'remux';
  if (!direct) return aacMaster ? 'transcode' : 'remux';
  return 'direct';
}

/** Resolve the concrete backend decision for an item + environment + user pref. */
export function planEngine(item: MediaItem, env: PlayEnv, pref: EnginePref): EnginePlan {
  const decision = selectEngine(item, env);
  const autoDirect = decision.kind === 'direct' || tvDirectPlay(item);
  // The user can override the automatic engine (profile menu -> Playback engine);
  // `auto` follows selectEngine.
  let eng = resolveEngine(pref, env, autoDirect);
  // A direct `<video>` on a container the webview can't demux (MKV/AVI in Safari)
  // would spin forever, so fall back to the server remux which repackages it.
  if (eng === 'video-direct' && !webviewCanDirectPlay(item)) eng = 'video-remux';
  const useMpv = eng === 'mpv';
  const useAvplay = eng === 'avplay';
  const avplayDirect = useAvplay && avplayDirectPlayable(item);
  const direct = eng === 'video-direct';
  return {
    eng,
    surface: surfaceFor(useMpv, useAvplay),
    useMpv,
    useAvplay,
    avplayDirect,
    direct,
    // Env-aware: Safari's native HLS decodes AC3/E-AC3 so its master is stream-copied
    // (5.1 kept); Chromium/webOS MSE can't, so `selectEngine` marks those AAC.
    masterAac: decision.aacMaster,
    playbackMode: playbackModeFor({
      useMpv,
      useAvplay,
      avplayDirect,
      direct,
      aacMaster: decision.aacMaster,
    }),
    deviceLabel: deviceLabelFor(useMpv),
    // Every flag that reaches an engine constructor, so the hook rebuilds on
    // exactly those and nothing else.
    rebuildKey: [eng, direct, avplayDirect, decision.aacMaster].join(':'),
  };
}

/** Build the concrete backend for a resolved plan. Returns `null` only when the
 * in-page `<video>` surface isn't mounted yet (the caller retries next render); the
 * native-plane engines are always constructed. */
export function createTvEngine(args: {
  plan: EnginePlan;
  client: KromaClient;
  item: MediaItem;
  durationSec: number;
  rendition: number;
  startSec: number;
  audioFilter: AudioFilterMode;
  /** The in-page surface handle + this runtime's native-HLS capability; only the
   * `<video>` engine reads either (the plane engines render behind the page). */
  dom: { video: HTMLVideoElement | null; nativeHls: boolean | undefined };
  listeners: EngineListeners;
}): TvEngine | null {
  const {
    plan: { eng, avplayDirect, direct, masterAac: aacMaster },
    client,
    item,
    durationSec,
    rendition,
    startSec,
    audioFilter,
    dom: { video, nativeHls: forceNativeHls },
    listeners,
  } = args;
  if (eng === 'mpv') {
    // Native mpv opens the original file directly (VA-API decode); an internal
    // direct->master fallback covers the rare file it cannot demux.
    const engine = new MpvEngine({
      client,
      item,
      durationSec,
      initialRendition: rendition,
      startSec,
      direct: true,
      audioFilter,
      listeners,
    });
    engine.start(); // async subscribe/open kept out of the constructor
    return engine;
  }
  if (eng === 'avplay') {
    return new AvplayEngine({
      client,
      item,
      durationSec,
      initialRendition: rendition,
      startSec,
      direct: avplayDirect,
      audioFilter,
      listeners,
    });
  }
  if (!video) return null;
  return new HtmlEngine({
    video,
    client,
    item,
    direct,
    masterAac: aacMaster,
    forceNativeHls,
    initialRendition: rendition,
    durationSec,
    startSec,
    listeners,
  });
}
