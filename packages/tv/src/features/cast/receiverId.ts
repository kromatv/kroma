// This TV's identity on the cast roster. Minted once and persisted with the
// other device preferences, so a relaunch re-announces the same receiver
// instead of adding a second ghost to everyone's picker.
//
// Not a credential: the server binds it to the account that first announced
// it. Must be unique and match the server's shape rule (8-64 of
// `[A-Za-z0-9._-]`).

import { readDeviceValue, writeDeviceValue } from '#tv/app/devicePref';

const KEY = 'kroma:cast-receiver-id';

let seq = 0;

function mint(): string {
  return `tv-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.floor(
    Math.random() * 0xffffff,
  )
    .toString(36)
    .padStart(4, '0')}`;
}

function usable(id: string | null): id is string {
  return !!id && id.length >= 8 && id.length <= 64 && /^[A-Za-z0-9._-]+$/.test(id);
}

let cached: string | null = null;

/** This device's receiver id, minting + persisting one on first use. */
export function receiverId(): string {
  if (cached) return cached;
  const stored = readDeviceValue(KEY);
  const id = usable(stored) ? stored : mint();
  if (id !== stored) writeDeviceValue(KEY, id);
  cached = id;
  return id;
}

/** Test seam: forget the memoized id so a test can re-derive it. */
export function resetReceiverIdCache(): void {
  cached = null;
}
