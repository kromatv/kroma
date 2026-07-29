// The remotes currently driving THIS television.
//
// The receiver provider learns them (they ride on this set's own `cast.receiver`
// row) and the top bar draws them, and those two live at opposite ends of the
// app. Rather than lift socket state into a context the whole tree re-renders
// on, the provider publishes here and the one chip that cares subscribes - the
// same module-level-slot shape as `castBridge`, for the same reason.

import type { CastClientMessage, CastController } from '@kroma/core';
import { useSyncExternalStore } from 'react';

/** Nobody is driving. A frozen shared value, so `useSyncExternalStore` doesn't
 * see a new array every read and loop. */
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

/** The remotes driving this TV, live. */
export function useCastControllers(): readonly CastController[] {
  return useSyncExternalStore(subscribe, read, read);
}

/** Who a remote IS, for the purpose of announcing it: a person on a device.
 *
 * NOT the controller id, which belongs to a socket - a phone that reconnects
 * arrives under a new one, and keying on it would announce the same person again
 * every time a network hiccuped. */
function who(controller: CastController): string {
  return `${controller.username}\u0000${controller.name}`;
}

/**
 * Publish the roster this set's row carries, and answer with whoever is NEW -
 * the caller announces those, and only those.
 *
 * The row is a full list and arrives again on every change to this set, so
 * without the diff a film starting - or one remote leaving - would announce
 * every other remote all over again.
 */
export function setCastControllers(next: readonly CastController[]): CastController[] {
  const before = new Set(controllers.map(who));
  controllers = next.length === 0 ? NOBODY : next;
  for (const listener of listeners) listener();
  return next.filter((c) => !before.has(who(c)));
}

/** Give the store a way to talk back to the server (the receiver's socket), or
 * `null` when that socket is gone. */
export function setCastUplink(send: ((message: CastClientMessage) => void) | null): void {
  uplink = send;
  if (!send) setCastControllers(NOBODY);
}

/** Hang up on one remote. The server answers by telling that sender it was
 * disconnected and broadcasting this set's row without it, so the list updates
 * through the same path as everything else - no optimistic removal. */
export function kickCastController(controllerId: string): void {
  uplink?.({ type: 'cast.kick', controllerId });
}
