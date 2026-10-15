// The seam between the cast receiver and the player that is actually running.
// The player registers itself here rather than threading a controller through
// the router; one module-level slot, since there is only ever one player.

import type { CastAnnounceBody } from '@kromatv/client/cast';
import type { MediaItem } from '@kromatv/client/media';
import type { WatchItem } from '@kromatv/client/watchable';
import { audioTrackLabel, langName } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import type { PlayerController } from '@kromatv/ui';
import { useEffect } from 'react';

export type CastPlaybackReport = NonNullable<CastAnnounceBody['playback']>;

export type CastPlaying = { item: MediaItem } | { watch: WatchItem; next: (() => void) | null };

interface Target {
  playing: CastPlaying;
  controller: PlayerController;
}

let target: Target | null = null;
let pendingSeek: { key: string; positionMs: number } | null = null;

export function castKey(playing: { item: Pick<MediaItem, 'id'> } | { watch: WatchItem }): string {
  if ('item' in playing) return playing.item.id;
  const { mount, id, file } = playing.watch;
  return `watch:${mount}:${id}:${file}`;
}

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
  const { playing, controller } = target;
  return [
    castKey(playing),
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
export function requestCastSeek(key: string, positionMs: number): void {
  pendingSeek = positionMs > 0 ? { key, positionMs } : null;
}

function takeCastSeek(key: string): number | null {
  if (pendingSeek?.key !== key) return null;
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
  const { playing, controller } = target;
  return {
    ...('item' in playing ? { itemId: playing.item.id } : { watch: playing.watch }),
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
 * cast `play` or `watch` asked for once the engine is ready to honour it. */
export function useCastTarget(playing: CastPlaying, controller: PlayerController): void {
  // No dependency array: `controller` is a new object every playback tick, so
  // this re-registers as a plain assignment rather than a diffed effect.
  useEffect(() => {
    setCastTarget({ playing, controller });
    return () => setCastTarget(null);
  });

  const { ready, seekTo } = controller;
  const key = castKey(playing);
  useEffect(() => {
    if (!ready) return;
    const positionMs = takeCastSeek(key);
    if (positionMs != null) seekTo(positionMs / 1000);
  }, [ready, key, seekTo]);
}
