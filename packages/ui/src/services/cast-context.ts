import type { CastCommand, CastReceiver, DiscoveredTv, ItemId } from '@kroma/core';
import { createContext, useContext } from 'react';

/** What a sender can do with the TV it is driving. */
export interface Cast {
  /** Live receivers on this server, the caller's own devices first. */
  receivers: CastReceiver[];
  /** Televisions heard in the room that have no account yet, so cannot be cast
   * to until someone gives them one. Empty on a shell that cannot listen to its
   * own link, which is every shell without the native module. */
  pairable: DiscoveredTv[];
  /** The receiver this sender is driving, or null when playing locally. */
  active: CastReceiver | null;
  /** Whether any TV is available to cast to (drives the button's visibility). */
  available: boolean;
  /** The active receiver's position, interpolated between heartbeats (ms). */
  positionMs: number;
  /** Start driving a receiver (or `null` to go back to local playback). */
  select: (receiverId: string | null) => void;
  /** Start a title on `receiverId`, and drive that TV from now on. */
  playOn: (receiverId: string, itemId: ItemId, positionMs?: number) => Promise<boolean>;
  /** Send an order to the active receiver. False when it failed / went away. */
  send: (command: CastCommand) => Promise<boolean>;
  /** The last failure, as a message key, or null. Cleared on the next success.
   * `cast.kicked` is not a failure exactly - the TV chose to let this remote go. */
  error: 'cast.gone' | 'cast.failed' | 'cast.kicked' | null;
}

const CastCtx = createContext<Cast | null>(null);

/** The cast session. Outside a provider it reads as "no TVs", so a screen can
 * use it unconditionally on a client that never mounted one. */
export function useCast(): Cast {
  return useContext(CastCtx) ?? IDLE;
}

const IDLE: Cast = {
  receivers: [],
  pairable: [],
  active: null,
  available: false,
  positionMs: 0,
  select: () => undefined,
  playOn: async () => false,
  send: async () => false,
  error: null,
};

export { CastCtx };
