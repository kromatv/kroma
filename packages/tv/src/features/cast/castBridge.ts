// The seam between the cast receiver and the player that is actually running.
//
// The receiver provider lives at the top of the app (it must announce whether or
// not a player is mounted), while the transport it drives belongs to the player
// screen. Rather than thread a controller through the router, the player
// registers itself here and the provider reads the current one - the same shape
// as `useNowPlaying`, which hands the OS widget the same handles.
//
// One module-level slot, because there is only ever one player on a TV.

import {
  audioTrackLabel,
  type CastAnnounceBody,
  langName,
  type MediaItem,
  type Translate,
} from '@kroma/core';
import type { PlayerController } from '@kroma/ui';
import { useEffect } from 'react';

/** What the receiver reports about the running player (the announce body's
 * `playback`, which is exactly this). */
export type CastPlaybackReport = NonNullable<CastAnnounceBody['playback']>;

interface Target {
  item: MediaItem;
  controller: PlayerController;
}

let target: Target | null = null;
/** A position a `play` command asked for, applied once its player is ready. */
let pendingSeek: { itemId: string; positionMs: number } | null = null;

/** Register the running player as the cast target (called by the player). */
export function setCastTarget(next: Target | null): void {
  target = next;
}

/** The running player, or null when the TV is not on the player screen. */
export function castTarget(): Target | null {
  return target;
}

/** Remember where a freshly-cast title should start; consumed once its player
 * reports ready. A cast `play` arrives *before* that player exists, so the
 * position cannot simply be seeked at command time. */
export function requestCastSeek(itemId: string, positionMs: number): void {
  pendingSeek = positionMs > 0 ? { itemId, positionMs } : null;
}

/** Take the pending seek for `itemId`, if it is still the one wanted. Single-shot. */
function takeCastSeek(itemId: string): number | null {
  if (!pendingSeek || pendingSeek.itemId !== itemId) return null;
  const { positionMs } = pendingSeek;
  pendingSeek = null;
  return positionMs;
}

/** What the receiver reports about the running player, or null when idle.
 *
 * The track lists are the *player's*, labelled exactly as its own pickers label
 * them, so a phone showing them offers what this TV can actually switch to. */
export function castReport(t: Translate): CastPlaybackReport | null {
  if (!target) return null;
  const { item, controller } = target;
  const state = controller.waiting ? 'buffering' : controller.playing ? 'playing' : 'paused';
  return {
    itemId: item.id,
    positionMs: Math.max(0, Math.round(controller.cur * 1000)),
    durationMs: controller.dur > 0 ? Math.round(controller.dur * 1000) : null,
    state,
    audioTracks: controller.audioTracks.map((track, i) => ({
      index: track.index,
      label: audioTrackLabel(t, track) ?? `#${i + 1}`,
    })),
    audioIndex: controller.audioIndex,
    // Picture subs (PGS/VobSub) are not selectable on a TV, so a remote must not
    // offer a track this player would refuse to switch to.
    subtitles: controller.subtitles
      .filter((s) => s.selectable)
      .map((s) => ({
        index: s.index,
        label:
          (s.ai && s.label ? s.label : langName(t, s.language)) || t('player.langUnknown'),
      })),
    subtitleIndex: controller.subtitleIndex ?? undefined,
  };
}

/**
 * Publish the running player to the cast receiver, and apply a position a cast
 * `play` asked for once the engine is ready to honour it.
 *
 * Re-registered on every render (the controller object is rebuilt each playback
 * tick), which is just an assignment - the provider reads it on its own 10 s
 * cadence instead of re-rendering with it.
 */
export function useCastTarget(item: MediaItem, controller: PlayerController): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately dependency-free - it re-registers each render because `controller` is a new object per tick.
  useEffect(() => {
    setCastTarget({ item, controller });
    return () => setCastTarget(null);
  });

  const { ready, seekTo } = controller;
  useEffect(() => {
    if (!ready) return;
    const positionMs = takeCastSeek(item.id);
    if (positionMs != null) seekTo(positionMs / 1000);
  }, [ready, item.id, seekTo]);
}
