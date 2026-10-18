// This TV's identity on the network: the id it is known by. Minted once and
// persisted with the other device preferences, so a relaunch is the same TV
// rather than a second ghost in everyone's picker.
//
// Not a credential: the cast roster binds the id to the account that first
// announced it, and a handoff beacon only ever reveals it on its own subnet.
// Must be unique; `DeviceId` carries the shape rule the server enforces.

import { DeviceId, type SessionStorage } from '@kromatv/client';
import { readDeviceValue, writeDeviceValue } from '#tv/app/devicePref';

// Named for the cast roster, which is where a device id was first needed. Kept
// as-is so an installed TV keeps the identity it already announced.
const KEY = 'kroma:cast-receiver-id';

function mint(): DeviceId {
  // This is a public roster id, never a credential. Prefer a platform UUID;
  // older TV webviews and Hermes can still mint a 128-bit random identifier.
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 0x100000000)
        .toString(16)
        .padStart(8, '0'),
    ).join('');
  return DeviceId.parse(`tv-${suffix}`);
}

/** One root's stable identity, read lazily after its device storage is ready. */
export function createDeviceIdentity(storage?: SessionStorage | null) {
  let cached: DeviceId | null = null;
  return function deviceId(): DeviceId {
    if (cached) return cached;
    const stored = readDeviceValue(KEY, storage);
    const kept = DeviceId.safeParse(stored);
    const id = kept.success ? kept.data : mint();
    if (id !== stored) writeDeviceValue(KEY, id, storage);
    cached = id;
    return id;
  };
}
export type DeviceIdentity = ReturnType<typeof createDeviceIdentity>;
