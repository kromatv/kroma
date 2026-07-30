// One cast order, executed on this TV. Orders reach the running player
// through the cast bridge rather than props, so one arriving while the TV
// sits on its home screen is a no-op instead of a crash.

import type { CastCommand, KromaClient, MediaItem } from '@kroma/core';
import { castTarget, requestCastSeek } from '#tv/features/cast/castBridge';

export interface CastRouter {
  reset: (name: 'player', params: { item: MediaItem }) => void;
  swap: (name: 'player', params: { item: MediaItem }) => void;
  home: () => void;
}

export interface CastDeps {
  client: Pick<KromaClient, 'item' | 'nextEpisode'>;
  nav: CastRouter;
}

async function play(
  command: Extract<CastCommand, { type: 'play' }>,
  deps: CastDeps,
  target: ReturnType<typeof castTarget>,
): Promise<void> {
  const controller = target?.controller;
  // Already on this title: seek rather than remount the engine, which would
  // black the screen for a second.
  if (target?.item.id === command.itemId) {
    if (command.positionMs) controller?.seekTo(command.positionMs / 1000);
    if (controller && !controller.playing) controller.togglePlay();
    return;
  }
  const item = await deps.client.item(command.itemId).catch(() => null);
  if (!item) return;
  requestCastSeek(item.id, command.positionMs ?? 0);
  // reset, not push: a cast launch has no detail screen behind it.
  deps.nav.reset('player', { item });
}

async function skipNext(
  deps: CastDeps,
  target: NonNullable<ReturnType<typeof castTarget>>,
): Promise<void> {
  const next = await deps.client.nextEpisode(target.item.id).catch(() => null);
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
