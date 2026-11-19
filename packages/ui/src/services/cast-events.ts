import type { DeviceId } from '@kromatv/client';
import type { CastReceiver } from '@kromatv/client/cast';
import type { ServerEvent } from '@kromatv/client/events';
import type { Dispatch, SetStateAction } from 'react';
import type { Cast } from './cast-context';
import { baseOf, type PositionBase } from './cast-position';

/** The state a [`applyCastEvent`] fold writes through. Grouped rather than
 * passed positionally: four same-shaped setters in a row is an argument list
 * nobody can read, and two of them are only touched by one event. */
interface CastEventSetters {
  receivers: Dispatch<SetStateAction<CastReceiver[]>>;
  activeId: Dispatch<SetStateAction<DeviceId | null>>;
  error: Dispatch<SetStateAction<Cast['error']>>;
  base: Dispatch<SetStateAction<PositionBase | null>>;
}

/** Fold one bus event into the roster / position state. `driving` is the
 * television this sender drives: the position base is its alone, so what
 * another television reports never moves this sender's playhead.
 *
 * At module scope rather than inside the effect: rows arrive whole (a play or
 * pause on one TV costs every sender a patch instead of a refetch), and keeping
 * the fold here means the effect stays a flat wiring step.
 */
function applyCastEvent(e: ServerEvent, set: CastEventSetters, driving: DeviceId | null): void {
  if (e.type === 'cast.receiver') {
    set.receivers((list) => upsert(list, e.receiver));
    if (e.receiver.id === driving) {
      set.base(baseOf(e.receiver));
    }
  } else if (e.type === 'cast.receiver.gone') {
    set.receivers((list) => list.filter((r) => r.id !== e.receiverId));
  } else if (e.type === 'cast.kicked') {
    // The television let this remote go. Stand down rather than keep showing a
    // set we no longer drive.
    set.activeId((id) => (id === e.receiverId ? null : id));
    set.error('cast.kicked');
  } else if (e.type === 'cast.position' && e.receiverId === driving) {
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
