// This TV's identity on the cast roster.
//
// Minted once and persisted with the other device preferences, so the phone that
// picked "Salon" yesterday finds the same entry today - and so a relaunch
// re-announces the SAME receiver instead of adding a second ghost to everyone's
// picker.
//
// The id is not a credential: the server binds it to the account that first
// announced it, and commands are addressed to that account. It only needs to be
// unique and to match the server's shape rule (8-64 of `[A-Za-z0-9._-]`), which
// a clock + a counter give on every target - the same reasoning as the playback
// session ids in @kroma/ui.

import { readDeviceValue, writeDeviceValue } from '#tv/app/devicePref';

const KEY = 'kroma:cast-receiver-id';

/** Ids minted in this process, so two mints in the same millisecond differ. */
let seq = 0;

function mint(): string {
  return `tv-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.floor(
    Math.random() * 0xffffff,
  )
    .toString(36)
    .padStart(4, '0')}`;
}

/** Whether a stored value is still something the server would accept (a value
 * hand-edited or written by an older build must not wedge the feature). */
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
