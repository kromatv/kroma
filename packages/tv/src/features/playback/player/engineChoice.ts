// Which backend a browser target should build for an item, and the three labels
// a plan carries. No engine is constructed here and nothing reads the DOM.

import type { MediaItem } from '@kromatv/client/media';
import { audioTracksOf, canDirectPlay, NATIVE_TV_CAPS, type PlayEnv } from '@kromatv/core';
import { availableEngines, type EnginePref } from '#tv/app/enginePref';
import { avplayAvailable, mpvAvailable, type Surface } from '#tv/features/playback/player/engine';

/** The concrete backend to build for this item. */
export type Engine = 'mpv' | 'avplay' | 'video-direct' | 'video-remux';

// The backend the user explicitly asked for, or null when the pref is `auto`
// or names an engine this platform can't run. Both fall through to automatic.
function manualEngine(pref: EnginePref, tizenNative: boolean): Engine | null {
  if (pref === 'avplay' && tizenNative) return 'avplay';
  if (pref === 'webview') return 'video-direct';
  if (pref === 'remux') return 'video-remux';
  // Forces the master even for a direct-play-able file, like the web client's
  // `shaka` preference; which MSE library plays it is the plan's `masterShaka`.
  if (pref === 'shaka') return 'video-remux';
  if (pref === 'mpv' && mpvAvailable()) return 'mpv';
  return null;
}

// Native planes where they exist (AVPlay on Tizen for hardware surround, mpv
// on the desktop shell), else `<video>` direct-play or the server remux.
function autoEngine(env: PlayEnv, tizenNative: boolean, autoDirect: boolean): Engine {
  if (tizenNative) return 'avplay';
  if (env.platform === 'desktop' && mpvAvailable()) return 'mpv';
  return autoDirect ? 'video-direct' : 'video-remux';
}

export function resolveEngine(pref: EnginePref, env: PlayEnv, autoDirect: boolean): Engine {
  // A stored engine no longer offered on this platform must not strand
  // playback on a dead engine: degrade it to `auto`.
  const wanted = pref !== 'auto' && availableEngines().includes(pref) ? pref : 'auto';
  const tizenNative = env.platform === 'tizen' && avplayAvailable();
  return manualEngine(wanted, tizenNative) ?? autoEngine(env, tizenNative, autoDirect);
}

/** A plain, single-audio MP4 a bare TV `<video>` direct-plays natively. */
export function tvDirectPlay(item: MediaItem): boolean {
  const container = (item.container ?? '').toLowerCase();
  if (container !== 'mp4' && container !== 'mov' && container !== 'm4v') return false;
  if (!canDirectPlay(item, NATIVE_TV_CAPS).canDirectPlay) return false;
  return audioTracksOf(item).length <= 1;
}

// Browser targets have to sniff the user agent, because Tizen / webOS / a
// desktop shell are all "a Chromium".
export function deviceLabelFor(useMpv: boolean): string {
  if (useMpv) return 'Desktop';
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  if (/Tizen/i.test(ua)) return 'Samsung TV';
  if (/web0?s|LG/i.test(ua)) return 'LG TV';
  return 'TV';
}

/** mpv / AVPlay render to their own plane behind the transparent UI, so neither
 * uses an in-page media element. */
export function surfaceFor(useMpv: boolean, useAvplay: boolean): Surface {
  if (useMpv) return 'mpv';
  if (useAvplay) return 'avplay';
  return 'video';
}

/** Video is always copied. AVPlay-direct plays the original file (direct);
 * AVPlay-master passes surround through (remux); only the hls.js AAC master
 * (webOS / MSE without AC3) re-encodes audio (transcode). */
export function playbackModeFor(flags: {
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
