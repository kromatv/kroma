// "Allow control from other devices": whether this TV joins the cast roster.
// Device-scoped and on by default. Turning it off unregisters the receiver
// immediately, so the set disappears from every picker rather than lingering
// until its TTL.

import { reactivePref } from '#tv/app/settings/store';

export const castReceiverPrefStore = reactivePref(
  'kroma:cast-receiver',
  ['on', 'off'] as const,
  'on',
);
