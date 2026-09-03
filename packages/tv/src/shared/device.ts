// This TV's identity on the network: the id it is known by. Minted once and
// persisted with the other device preferences, so a relaunch is the same TV
// rather than a second ghost in everyone's picker.
//
// Not a credential: the cast roster binds the id to the account that first
// announced it, and a handoff beacon only ever reveals it on its own subnet.
// Must be unique; `DeviceId` carries the shape rule the server enforces.

import { DeviceId } from '@kroma/client';
import { readDeviceValue, writeDeviceValue } from '#tv/app/devicePref';

// Named for the cast roster, which is where a device id was first needed. Kept
// as-is so an installed TV keeps the identity it already announced.
const KEY = 'kroma:cast-receiver-id';

let seq = 0;

function mint(): DeviceId {
  return DeviceId.parse(
    `tv-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.floor(Math.random() * 0xffffff)
      .toString(36)
      .padStart(4, '0')}`,
  );
}

let cached: DeviceId | null = null;

/** This device's stable id, minting + persisting one on first use. */
export function deviceId(): DeviceId {
  if (cached) return cached;
  const stored = readDeviceValue(KEY);
  const kept = DeviceId.safeParse(stored);
  const id = kept.success ? kept.data : mint();
  if (id !== stored) writeDeviceValue(KEY, id);
  cached = id;
  return id;
}

/** Test seam: forget the memoized id so a test can re-derive it. */
export function resetDeviceIdCache(): void {
  cached = null;
}
