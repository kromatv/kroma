import type { DeviceId } from '@kromatv/client';
import type { CastCommand, CastReceiver } from '@kromatv/client/cast';
import type { ItemId } from '@kromatv/client/media';
import type { DiscoveredTv } from '@kromatv/core';
import { createContext, useContext } from 'react';

/** Why an order did not reach a television, as a message key. `cast.titleGone`
 * is the title's failure rather than the set's, so the sender keeps driving it. */
export type CastFailure = 'cast.gone' | 'cast.titleGone' | 'cast.failed';

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
  select: (receiverId: DeviceId | null) => void;
  /** Start a title on `receiverId`, and drive that TV from now on. */
  playOn: (
    receiverId: DeviceId,
    itemId: ItemId,
    positionMs?: number,
  ) => Promise<CastFailure | null>;
  /** Send an order to the active receiver. */
  send: (command: CastCommand) => Promise<CastFailure | null>;
  /** The last failure, or `cast.kicked` where the television let this remote go,
   * which is not a failure exactly. Cleared on the next success. */
  error: CastFailure | 'cast.kicked' | null;
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
  playOn: () => Promise.resolve<CastFailure>('cast.failed'),
  send: () => Promise.resolve<CastFailure>('cast.failed'),
  error: null,
};

export { CastCtx };
