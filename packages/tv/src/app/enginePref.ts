// User-selectable playback engine (a manual override of the automatic
// `selectEngine` decision), persisted per device. Surfaced as a cycle-row in the
// profile menu and honored by `useDirectPlayback`.
//
//  - auto     : let selectEngine + the platform decide (default).
//  - avplay   : force Samsung's native AVPlay (Tizen only) - hardware decode +
//               surround passthrough, plays the original file directly.
//  - webview  : force the in-page `<video>` direct-play (WKWebView = VideoToolbox on
//               macOS; a bare `<video src>` at the original file, zero server work).
//  - remux    : force the server HLS master through `<video>` + hls.js (works for
//               anything the server can remux, incl. MKV; video is stream-copied).
//  - mpv      : force the native mpv engine (VA-API on the Linux/Deck shell).

import { isTizenRuntime, isWebOsRuntime, type MessageKey } from '@kroma/core';
import { Platform } from 'react-native';
import { reactivePref } from '#tv/app/settings/store';
import { mpvAvailable } from '#tv/features/playback/player/engine';

export type EnginePref = 'auto' | 'avplay' | 'webview' | 'remux' | 'mpv';

const ALL: readonly EnginePref[] = ['auto', 'avplay', 'webview', 'remux', 'mpv'];

/** The reactive store behind the pref (the settings registry binds rows to it). */
export const enginePrefStore = reactivePref('kroma:engine', ALL, 'auto');

/** The saved engine preference for this device, or `auto`. A stored engine no
 * longer offered on THIS platform (e.g. a device left on `remux` before it was
 * retired on Android TV, where the WebView cannot decode HEVC) is degraded to
 * `auto` by the playback engine resolver, not here. */
export function getEnginePref(): EnginePref {
  return enginePrefStore.get();
}

/** Persist the engine preference. */
export function setEnginePref(p: EnginePref): void {
  enginePrefStore.set(p);
}

/** Engines the user may choose on THIS platform (always starts with `auto`), so the
 * menu can offer a real switch. Even the TVs have two players: Tizen can use its
 * native AVPlay OR the HTML5 (`<video>` + hls.js) server-remux path; webOS has no
 * AVPlay but can do direct `<video>` vs the remux. mpv is offered only on the Linux
 * desktop shell. A single-entry list (unknown/other) hides the row. */
export function availableEngines(): EnginePref[] {
  // The native clients have ONE player (expo-video: AVPlayer / Media3). The only
  // choice left is whether it opens the original file or the server's remux, so
  // that is all the row offers. Everything below this line names a browser engine
  // that does not exist here - an Apple TV was being offered "webview".
  if (Platform.OS !== 'web') return ['auto', 'remux'];
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (isTizenRuntime(ua)) return ['auto', 'avplay', 'remux'];
  if (isWebOsRuntime(ua)) return ['auto', 'webview', 'remux'];
  const list: EnginePref[] = ['auto', 'webview', 'remux'];
  // mpv is offered when a native mpv engine is present: the Linux/Deck shell (mpv
  // binary), or the macOS shell whose in-process libmpv engine flagged itself.
  if (mpvAvailable()) list.splice(1, 0, 'mpv');
  return list;
}

/** i18n label key for each engine (rendered in the picker). */
export const ENGINE_LABEL_KEY: Record<EnginePref, MessageKey> = {
  auto: 'playbackEngine.auto',
  avplay: 'playbackEngine.avplay',
  webview: 'playbackEngine.webview',
  remux: 'playbackEngine.remux',
  mpv: 'playbackEngine.mpv',
};
