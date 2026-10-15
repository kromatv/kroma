// The web playback backend: which engine to build for an item on a browser
// target, and how to build it: a bare <video> plus hls.js, Samsung's AVPlay
// plane, or mpv on the desktop shell. The hook that drives playback never
// learns which one it got.

import type { KromaClient } from '@kromatv/client';
import type { MediaItem } from '@kromatv/client/media';
import { avplayDirectPlayable, type PlayEnv, selectEngine } from '@kromatv/core';
import type { AudioFilterMode } from '@kromatv/ui';
import type { EnginePref } from '#tv/app/enginePref';
import { AvplayEngine } from '#tv/features/playback/player/avplayEngine';
import {
  type EngineListeners,
  type Surface,
  shakaAvailable,
  type TvEngine,
} from '#tv/features/playback/player/engine';
import {
  deviceLabelFor,
  type Engine,
  playbackModeFor,
  resolveEngine,
  surfaceFor,
  tvDirectPlay,
} from '#tv/features/playback/player/engineChoice';
import { HtmlEngine } from '#tv/features/playback/player/htmlEngine';
import { MpvEngine } from '#tv/features/playback/player/mpvEngine';

// The video surface an engine renders to. `video` is an in-tree element the
// chrome can transform; the others are planes behind a transparent page.
export type { Engine, Surface };

const CONTAINER_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
};

// Safari / WKWebView has no Matroska or AVI demuxer, so a forced direct-play
// on one loads forever at HAVE_NOTHING with no error. Callers fall back to
// the server remux instead.
function webviewCanDirectPlay(item: MediaItem): boolean {
  if (typeof document === 'undefined') return true;
  const mime = CONTAINER_MIME[(item.container ?? '').toLowerCase()];
  if (!mime) return false;
  return document.createElement('video').canPlayType(mime) !== '';
}

/** The resolved backend plan for an item. Pure (no React) so it stays out of
 * the hook body. */
export interface EnginePlan {
  eng: Engine;
  surface: Surface;
  useMpv: boolean;
  useAvplay: boolean;
  avplayDirect: boolean;
  direct: boolean;
  masterAac: boolean;
  masterShaka: boolean;
  playbackMode: 'direct' | 'remux' | 'transcode';
  deviceLabel: string;
  rebuildKey: string;
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
  // Shaka drives the MSE master wherever it ships, like the web client; only
  // the explicit `remux` preference keeps hls.js.
  const masterShaka = shakaAvailable() && pref !== 'remux';
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
    masterShaka,
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
    rebuildKey: [eng, direct, avplayDirect, decision.aacMaster, masterShaka].join(':'),
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
  dom: { video: HTMLVideoElement | null; nativeHls: boolean | undefined };
  listeners: EngineListeners;
}): TvEngine | null {
  const {
    plan: { eng, avplayDirect, direct, masterAac: aacMaster, masterShaka },
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
    masterShaka,
    forceNativeHls,
    initialRendition: rendition,
    durationSec,
    startSec,
    listeners,
  });
}
