// User-selectable playback engine: a manual override of the automatic
// `selectEngine` decision, persisted per device.

import { isTizenRuntime, isWebOsRuntime, type MessageKey } from '@kroma/core';
import { Platform } from 'react-native';
import { devicePref } from '#tv/app/devicePref';
import type { ReactivePref } from '#tv/app/settings/store';
import { mpvAvailable, shakaAvailable } from '#tv/features/playback/player/engine';
import { vlcAvailable } from '#tv/features/playback/player/vlcPlane';

export type EnginePref = 'auto' | 'avplay' | 'webview' | 'shaka' | 'remux' | 'mpv' | 'vlc';

const ALL: readonly EnginePref[] = ['auto', 'avplay', 'webview', 'shaka', 'remux', 'mpv', 'vlc'];

const stored = devicePref('kroma:engine', ALL, 'auto');
const listeners = new Set<() => void>();
let chosen: EnginePref | null = null;

/** Reads through to the device store until this session picks an engine, because
 * the native shells install that store only once the session file has been read:
 * a value snapshot taken while this module is evaluated is always the `auto`
 * fallback, and would pin the engine to it for the life of the process. A choice
 * made here wins from then on, so it still holds where the write could not land. */
export const enginePrefStore: ReactivePref<EnginePref> = {
  get: () => chosen ?? stored.get(),
  set(value: EnginePref) {
    if (value === (chosen ?? stored.get())) return;
    chosen = value;
    stored.set(value);
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** A stored engine no longer offered on THIS platform is degraded to `auto` by
 * the playback engine resolver, not here. */
export function getEnginePref(): EnginePref {
  return enginePrefStore.get();
}

export function setEnginePref(p: EnginePref): void {
  enginePrefStore.set(p);
}

/** Engines choosable on THIS platform, always starting with `auto`. An empty
 * list hides the row. */
export function availableEngines(): EnginePref[] {
  // Both native shells build the libVLC plane, so the choice is the platform
  // player, the server's remux, or the engine that brings its own decoders. On
  // Apple that last one also brings a Matroska demuxer, which AVFoundation has
  // none of.
  if (Platform.OS !== 'web') {
    return vlcAvailable() ? ['auto', 'remux', 'vlc'] : ['auto', 'remux'];
  }
  // The legacy tier ships without Shaka (see shakaAvailable), so the pref only
  // appears where picking it can change anything.
  const shaka: EnginePref[] = shakaAvailable() ? ['shaka'] : [];
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (isTizenRuntime(ua)) return ['auto', 'avplay', ...shaka, 'remux'];
  if (isWebOsRuntime(ua)) return ['auto', 'webview', ...shaka, 'remux'];
  const list: EnginePref[] = ['auto', 'webview', ...shaka, 'remux'];
  if (mpvAvailable()) list.splice(1, 0, 'mpv');
  return list;
}

/** One line saying what an engine actually does, since its name cannot. */
export const ENGINE_NOTE_KEY: Record<EnginePref, MessageKey> = {
  auto: 'playbackEngine.autoNote',
  avplay: 'playbackEngine.avplayNote',
  webview: 'playbackEngine.webviewNote',
  shaka: 'playbackEngine.shakaNote',
  remux: 'playbackEngine.remuxNote',
  mpv: 'playbackEngine.mpvNote',
  vlc: 'playbackEngine.vlcNote',
};

export const ENGINE_LABEL_KEY: Record<EnginePref, MessageKey> = {
  auto: 'playbackEngine.auto',
  avplay: 'playbackEngine.avplay',
  webview: 'playbackEngine.webview',
  shaka: 'playbackEngine.shaka',
  remux: 'playbackEngine.remux',
  mpv: 'playbackEngine.mpv',
  vlc: 'playbackEngine.vlc',
};
