// "Allow control from other devices" - whether this TV joins the cast roster.
//
// Device-scoped and on by default: a TV in the living room is exactly the thing
// a phone wants to drive, and the roster is already limited to accounts on this
// server. Turning it off unregisters the receiver immediately (the provider's
// cleanup runs), so the set disappears from every picker rather than lingering
// until its TTL.

import { reactivePref } from '#tv/app/settings/store';

export const castReceiverPrefStore = reactivePref(
  'kroma:cast-receiver',
  ['on', 'off'] as const,
  'on',
);
