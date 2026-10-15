// One cast order, executed on this TV. Orders reach the running player
// through the cast bridge rather than props, so one arriving while the TV
// sits on its home screen is a no-op instead of a crash.

import type { KromaClient } from '@kromatv/client';
import type { CastCommand } from '@kromatv/client/cast';
import type { MediaItem } from '@kromatv/client/media';
import { type WatchSubject, watchSubjectOf } from '@kromatv/core';
import { castKey, castTarget, requestCastSeek } from '#tv/features/cast/castBridge';

type Target = NonNullable<ReturnType<typeof castTarget>>;

export interface CastRouter {
  reset: {
    (name: 'player', params: { item: MediaItem }): void;
    (name: 'watch', params: { subject: WatchSubject; poster?: string | null }): void;
  };
  swap: (name: 'player', params: { item: MediaItem }) => void;
  home: () => void;
}

export interface CastDeps {
  client: Pick<KromaClient, 'media' | 'playback'>;
  nav: CastRouter;
  watchable: { choose: (mount: string) => void };
}

function resumeHere(target: Target | null, key: string, positionMs = 0): boolean {
  const controller = target?.controller;
  // Already on this title: seek rather than remount the engine, which would
  // black the screen for a second.
  if (!target || !controller || castKey(target.playing) !== key) return false;
  if (positionMs) controller.seekTo(positionMs / 1000);
  if (!controller.playing) controller.togglePlay();
  return true;
}

async function play(
  command: Extract<CastCommand, { type: 'play' }>,
  deps: CastDeps,
  target: Target | null,
): Promise<void> {
  if (resumeHere(target, command.itemId, command.positionMs)) return;
  const item = await deps.client.media.item(command.itemId).catch(() => null);
  if (!item) return;
  requestCastSeek(item.id, command.positionMs ?? 0);
  // reset, not push: a cast launch has no detail screen behind it.
  deps.nav.reset('player', { item });
}

function watch(
  command: Extract<CastCommand, { type: 'watch' }>,
  deps: CastDeps,
  target: Target | null,
): void {
  const key = castKey({ watch: command.watch });
  if (resumeHere(target, key, command.positionMs)) return;
  deps.watchable.choose(command.watch.mount);
  requestCastSeek(key, command.positionMs ?? 0);
  deps.nav.reset('watch', {
    subject: watchSubjectOf(command.watch),
    poster: command.watch.poster ?? null,
  });
}

async function skipNext(deps: CastDeps, target: Target): Promise<void> {
  const { playing } = target;
  if (!('item' in playing)) {
    playing.next?.();
    return;
  }
  const next = await deps.client.playback.nextEpisode(playing.item.id).catch(() => null);
  // swap, not push: what is behind the player stays behind it.
  if (next) deps.nav.swap('player', { item: next });
}

/** Execute one order against the running player (or the router, for `play`). */
export async function applyCastCommand(command: CastCommand, deps: CastDeps): Promise<void> {
  const target = castTarget();
  const controller = target?.controller;

  switch (command.type) {
    case 'play':
      return play(command, deps, target);
    case 'watch':
      return watch(command, deps, target);
    case 'skipNext':
      return target ? skipNext(deps, target) : undefined;
    case 'pause':
      if (controller?.playing) controller.togglePlay();
      return;
    case 'resume':
      if (controller && !controller.playing) controller.togglePlay();
      return;
    case 'togglePlay':
      controller?.togglePlay();
      return;
    case 'seek':
      controller?.seekTo(command.positionMs / 1000);
      return;
    case 'skip':
      controller?.skip(command.deltaMs / 1000);
      return;
    case 'stop':
      // Only leaves the PLAYER: a stale `stop` must not yank a viewer out of
      // whatever they have browsed to since.
      if (target) deps.nav.home();
      return;
    case 'setAudio':
      controller?.setAudio(command.index);
      return;
    case 'setSubtitle':
      controller?.setSubtitle(command.index);
      return;
  }
}
