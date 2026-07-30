// The remotes currently driving THIS television. A module-level slot rather than
// a context, so publishing a new roster re-renders only the chip that reads it.

import type { CastClientMessage, CastController } from '@kroma/core';
import { useSyncExternalStore } from 'react';

// Shared and frozen, so `useSyncExternalStore` doesn't see a new array every
// read and loop.
const NOBODY: readonly CastController[] = Object.freeze([]);

let controllers: readonly CastController[] = NOBODY;
let uplink: ((message: CastClientMessage) => void) | null = null;

const listeners = new Set<() => void>();

function read(): readonly CastController[] {
  return controllers;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCastControllers(): readonly CastController[] {
  return useSyncExternalStore(subscribe, read, read);
}

// Not the controller id: that belongs to a socket, so a phone that reconnects
// arrives under a new one and would be announced again.
function who(controller: CastController): string {
  return `${controller.username}\u0000${controller.name}`;
}

/** Publishes the roster and returns only the remotes that are new, so a caller
 * announcing them does not re-announce the rest on every roster change. */
export function setCastControllers(next: readonly CastController[]): CastController[] {
  const before = new Set(controllers.map(who));
  controllers = next.length === 0 ? NOBODY : next;
  for (const listener of listeners) listener();
  return next.filter((c) => !before.has(who(c)));
}

export function setCastUplink(send: ((message: CastClientMessage) => void) | null): void {
  uplink = send;
  if (!send) setCastControllers(NOBODY);
}

/** Hangs up on one remote; the list updates when the server broadcasts the row
 * without it, never optimistically. */
export function kickCastController(controllerId: string): void {
  uplink?.({ type: 'cast.kick', controllerId });
}
