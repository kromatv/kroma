import type { CastReceiver, ServerEvent } from '@kroma/core';
import type { Dispatch, SetStateAction } from 'react';
import type { Cast } from './cast-context';
import type { PositionBase } from './cast-position';

/** The state a [`applyCastEvent`] fold writes through. Grouped rather than
 * passed positionally: four same-shaped setters in a row is an argument list
 * nobody can read, and two of them are only touched by one event. */
interface CastEventSetters {
  receivers: Dispatch<SetStateAction<CastReceiver[]>>;
  activeId: Dispatch<SetStateAction<string | null>>;
  error: Dispatch<SetStateAction<Cast['error']>>;
  base: Dispatch<SetStateAction<PositionBase | null>>;
}

/** Fold one bus event into the roster / position state.
 *
 * At module scope rather than inside the effect: rows arrive whole (a play or
 * pause on one TV costs every sender a patch instead of a refetch), and keeping
 * the fold here means the effect stays a flat wiring step.
 */
function applyCastEvent(e: ServerEvent, set: CastEventSetters): void {
  if (e.type === 'cast.receiver') {
    set.receivers((list) => upsert(list, e.receiver));
  } else if (e.type === 'cast.receiver.gone') {
    set.receivers((list) => list.filter((r) => r.id !== e.receiverId));
  } else if (e.type === 'cast.kicked') {
    // The television let this remote go. Stand down rather than keep showing a
    // set we no longer drive.
    set.activeId((id) => (id === e.receiverId ? null : id));
    set.error('cast.kicked');
  } else if (e.type === 'cast.position') {
    set.base({
      id: e.receiverId,
      positionMs: e.positionMs,
      playing: e.state === 'playing',
      at: Date.now(),
    });
  }
}

/** Replace a receiver's row, or add it, keeping the list sorted by name (the
 * server's own order, so a patched list and a refetched one agree). */
function upsert(list: CastReceiver[], row: CastReceiver): CastReceiver[] {
  const next = list.some((r) => r.id === row.id)
    ? list.map((r) => (r.id === row.id ? row : r))
    : [...list, row];
  return next.sort((a, b) => a.name.localeCompare(b.name));
}

export { applyCastEvent };
