import type { SessionStorage } from '@kromatv/client';
// "Allow control from other devices": whether this TV joins the cast roster.
// Device-scoped and on by default. Turning it off unregisters the receiver
// immediately, so the set disappears from every picker rather than lingering
// until its TTL.

import { reactivePref } from '#tv/app/settings/store';

export function createCastReceiverPref(storage?: SessionStorage | null) {
  return reactivePref('kroma:cast-receiver', ['on', 'off'] as const, 'on', storage);
}
