// The seam between the cast receiver and the player that is actually running.
// The player registers itself here rather than threading a controller through
// the router; one module-level slot, since there is only ever one player.

import {
  audioTrackLabel,
  type CastAnnounceBody,
  langName,
  type MediaItem,
  type Translate,
} from '@kroma/core';
import type { PlayerController } from '@kroma/ui';
import { useEffect } from 'react';

export type CastPlaybackReport = NonNullable<CastAnnounceBody['playback']>;

interface Target {
  item: MediaItem;
  controller: PlayerController;
}

let target: Target | null = null;
let pendingSeek: { itemId: string; positionMs: number } | null = null;

const listeners = new Set<() => void>();
let signature = '';

/** Fires only on a material change (title, transport state, track selection),
 * not position, which changes ~4 times a second and senders interpolate from
 * the clock themselves. */
export function onCastReportChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

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

let notifyQueued = false;

// The player re-registers on every render, and React runs the previous
// effect's cleanup first, so each tick is `setCastTarget(null)` immediately
// followed by `setCastTarget(player)`. Notifying on both would flap the
// reported state several times a second; deferring to a microtask collapses
// the pair into the one state true at the end of the tick.
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

function takeCastSeek(itemId: string): number | null {
  if (pendingSeek?.itemId !== itemId) return null;
  const { positionMs } = pendingSeek;
  pendingSeek = null;
  return positionMs;
}

// `buffering` is "playing, stalled": the sender keeps the pause button and
// adds a spinner.
function transportState(controller: PlayerController): 'buffering' | 'playing' | 'paused' {
  if (controller.waiting) return 'buffering';
  return controller.playing ? 'playing' : 'paused';
}

/** What the receiver reports about the running player, or null when idle. The
 * track lists are the player's own, so a phone offers what this TV can
 * actually switch to. */
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

/** Publish the running player to the cast receiver, and apply a position a
 * cast `play` asked for once the engine is ready to honour it. */
export function useCastTarget(item: MediaItem, controller: PlayerController): void {
  // No dependency array: `controller` is a new object every playback tick, so
  // this re-registers as a plain assignment rather than a diffed effect.
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
