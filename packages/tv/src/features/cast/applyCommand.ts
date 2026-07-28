// One cast order, executed on this TV.
//
// Split out of the provider because this is the whole behaviour of the receiver
// and it is worth testing on its own: the provider around it is a heartbeat and
// a socket, but *this* is what a viewer feels when they press a button on their
// phone.
//
// Everything reaches the running player through the cast bridge rather than
// props, so an order that arrives while the TV sits on its home screen is a
// no-op instead of a crash - which is exactly what a stale `pause` should be.

import type { CastCommand, KromaClient, MediaItem } from '@kroma/core';
import { castTarget, requestCastSeek } from '#tv/features/cast/castBridge';

/** What executing an order needs: the API and the router. */
export interface CastRouter {
  /** Replace the stack with home → player (a cast launch has no history). */
  reset: (name: 'player', params: { item: MediaItem }) => void;
  /** Replace the current screen (up-next, so Back still leaves the player). */
  swap: (name: 'player', params: { item: MediaItem }) => void;
  /** Back to the root screen. */
  home: () => void;
}

export interface CastDeps {
  client: Pick<KromaClient, 'item' | 'nextEpisode'>;
  nav: CastRouter;
}

/** The two commands that reach the network and the navigator, lifted out of the
 * switch so the transport verbs below stay a flat table. */

/** `play`: resume the running title, or launch the requested one. */
async function play(
  command: Extract<CastCommand, { type: 'play' }>,
  deps: CastDeps,
  target: ReturnType<typeof castTarget>,
): Promise<void> {
  const controller = target?.controller;
  // Already on this title → a re-cast, not a relaunch: seek instead of
  // remounting the engine, which would black the screen for a second.
  if (target?.item.id === command.itemId) {
    if (command.positionMs) controller?.seekTo(command.positionMs / 1000);
    if (controller && !controller.playing) controller.togglePlay();
    return;
  }
  const item = await deps.client.item(command.itemId).catch(() => null);
  if (!item) return;
  requestCastSeek(item.id, command.positionMs ?? 0);
  // reset, not push: Back out of a cast-launched player goes home, because no
  // detail screen was ever walked through to reach it.
  deps.nav.reset('player', { item });
}

/** `skipNext`: advance to the next episode of what is playing. */
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
      // Only leaves the PLAYER. A stale `stop` (from a phone that missed a beat)
      // must not yank a viewer out of whatever they have browsed to since.
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
