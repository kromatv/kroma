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

/** Subscribers woken when something a remote DRAWS changes (see `signature`). */
const listeners = new Set<() => void>();
let signature = '';

/**
 * Be told when the player changes in a way a sender must hear about.
 *
 * The position is deliberately not part of it: it changes ~4 times a second and
 * senders interpolate it from the clock, so pushing it on every tick would put
 * the heartbeat back by another name. What fires here is a title, a transport
 * state, or a track selection - the things a person actually did.
 */
export function onCastReportChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The material fields, as a comparable string. Cheap enough to build on every
 * render of the player, which is where it is checked from. */
function materialSignature(): string {
  if (!target) return '';
  const { item, controller } = target;
  return [
    item.id,
    transportState(controller),
    controller.audioIndex,
    controller.subtitleIndex ?? 'off',
    controller.audioTracks.length,
    controller.subtitles.length,
  ].join('|');
}

/** Whether a change notification is already queued for this tick. */
let notifyQueued = false;

/**
 * Tell subscribers, but only once the dust settles.
 *
 * The player re-registers on EVERY render, and React runs the previous effect's
 * cleanup first - so each playback tick is `setCastTarget(null)` immediately
 * followed by `setCastTarget(player)`. Notifying on both would report the TV as
 * idle and then playing again several times a second: the receiver would push
 * that flapping to the server, and a phone's remote would blink between "Ready"
 * and the film. Deferring to a microtask collapses the pair into the one state
 * that is actually true at the end of the tick.
 */
function notifyChange(): void {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    const now = materialSignature();
    if (now === signature) return;
    signature = now;
    for (const listener of listeners) listener();
  });
}

/** Register the running player as the cast target (called by the player). */
export function setCastTarget(next: Target | null): void {
  target = next;
  notifyChange();
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
  if (pendingSeek?.itemId !== itemId) return null;
  const { positionMs } = pendingSeek;
  pendingSeek = null;
  return positionMs;
}

/** How a remote should draw the transport. `buffering` is "playing, stalled":
 * the sender keeps the pause button and adds a spinner. */
function transportState(controller: PlayerController): 'buffering' | 'playing' | 'paused' {
  if (controller.waiting) return 'buffering';
  return controller.playing ? 'playing' : 'paused';
}

/** What the receiver reports about the running player, or null when idle.
 *
 * The track lists are the *player's*, labelled exactly as its own pickers label
 * them, so a phone showing them offers what this TV can actually switch to. */
export function castReport(t: Translate): CastPlaybackReport | null {
  if (!target) return null;
  const { item, controller } = target;
  return {
    itemId: item.id,
    positionMs: Math.max(0, Math.round(controller.cur * 1000)),
    durationMs: controller.dur > 0 ? Math.round(controller.dur * 1000) : null,
    state: transportState(controller),
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
        label: (s.ai && s.label ? s.label : langName(t, s.language)) || t('player.langUnknown'),
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
  // No dependency array on purpose: `controller` is a new object on every
  // playback tick, so the registration is refreshed each render (an assignment)
  // rather than diffed.
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
