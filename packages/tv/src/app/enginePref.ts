// User-selectable playback engine: a manual override of the automatic
// `selectEngine` decision, persisted per device.

import { isTizenRuntime, isWebOsRuntime, type MessageKey } from '@kroma/core';
import { Platform } from 'react-native';
import { reactivePref } from '#tv/app/settings/store';
import { mpvAvailable, shakaAvailable } from '#tv/features/playback/player/engine';

export type EnginePref = 'auto' | 'avplay' | 'webview' | 'shaka' | 'remux' | 'mpv';

const ALL: readonly EnginePref[] = ['auto', 'avplay', 'webview', 'shaka', 'remux', 'mpv'];

export const enginePrefStore = reactivePref('kroma:engine', ALL, 'auto');

/** A stored engine no longer offered on THIS platform is degraded to `auto` by
 * the playback engine resolver, not here. */
export function getEnginePref(): EnginePref {
  return enginePrefStore.get();
}

export function setEnginePref(p: EnginePref): void {
  enginePrefStore.set(p);
}

/** Engines choosable on THIS platform, always starting with `auto`. A
 * single-entry list hides the row. */
export function availableEngines(): EnginePref[] {
  // Native clients have one player (expo-video: AVPlayer / Media3); the only
  // choice is the original file or the server's remux.
  if (Platform.OS !== 'web') return ['auto', 'remux'];
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

export const ENGINE_LABEL_KEY: Record<EnginePref, MessageKey> = {
  auto: 'playbackEngine.auto',
  avplay: 'playbackEngine.avplay',
  webview: 'playbackEngine.webview',
  shaka: 'playbackEngine.shaka',
  remux: 'playbackEngine.remux',
  mpv: 'playbackEngine.mpv',
};
