// What this television calls itself, when the platform will say.
//
// A shell hands its own source in, the way it hands in its DNS-SD stack: only
// the shell knows which vendor API answers, and none of them look alike.
// Nothing here imports a platform.
//
// WHAT EACH PLATFORM CAN ACTUALLY RETURN, because the answers differ in kind
// and a caller should not expect the name on the box:
//
// - Tizen: the owner's own name, from `webapis.network.getTVName()` - Samsung
//   documents it as the set's configured network name, the one it already
//   announces to AirPlay and Smart View.
// - Android TV: the owner's own name, typed in setup
//   (`Settings.Global.DEVICE_NAME`).
// - webOS: the owner's own name, from the preferences service's
//   `com.webos.service.properties.deviceName`. NOT the settings service, which
//   documents no such key, and not `webOS.deviceInfo()`, which is the model.
// - tvOS: the model ("Apple TV") unless the app carries Apple's user-assigned
//   device-name entitlement, which is requested from Apple, not switched on.
//
// So three of the four give the real thing, and tvOS gives a model until that
// entitlement lands. A source that cannot do better answers null and the caller
// keeps the platform label.

import { safeLabel } from '@kroma/core';
import { useCallback, useSyncExternalStore } from 'react';

/** Where this shell's answer comes from. `subscribe` is optional only for a
 * platform that answers synchronously and never changes its mind: Tizen's and
 * webOS's buses both reply through a callback, well after the first announce,
 * and a source that cannot say so leaves the beacon under the platform label
 * for the whole session. */
export interface DeviceNameSource {
  get(): string | null | undefined;
  subscribe?(listener: () => void): () => void;
}

export interface LateDeviceName extends DeviceNameSource {
  found(name: string | null | undefined): void;
}

/** A source whose answer lands after the shell mounted, which is the normal
 * case. The shell calls `found` when its bus replies and every reader re-reads;
 * an empty answer is not one, so a later silence cannot erase a good name. */
export function lateDeviceName(): LateDeviceName {
  const listeners = new Set<() => void>();
  let name: string | null = null;
  return {
    get: () => name,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    found(next) {
      const answer = clean(next);
      if (!answer || answer === name) return;
      name = answer;
      for (const listener of listeners) listener();
    },
  };
}

// The server's own rule for a device name (MAX_NAME 48 in
// services/pairing/handoff.rs), applied here so a vendor string that is longer,
// padded or carrying control characters is trimmed to something a picker can
// draw rather than refused by the server after the fact.
const MAX = 48;

function clean(value: string | null | undefined): string | null {
  return safeLabel(value, MAX) || null;
}

function read(source: DeviceNameSource | undefined): string | null {
  try {
    return clean(source?.get());
  } catch {
    return null;
  }
}

const noop = () => undefined;

/**
 * This television's name: the platform's own answer when the shell handed in a
 * source that has one ("The Frame" beats "Tizen" in a list of televisions, and
 * on Android TV it is the name the owner typed), and the platform label when it
 * has none - typing a name on a D-pad is a chore nobody should be sent on.
 *
 * Re-renders when a late answer lands, which is what lets the beacon and the
 * cast record announce the real name rather than the label they booted with.
 * Never throws: a vendor API missing on one firmware and present on the next is
 * the normal case, so a source that blows up is a source with nothing to say.
 */
export function useDeviceName(source: DeviceNameSource | undefined, platform: string): string {
  const subscribe = useCallback(
    (listener: () => void) => source?.subscribe?.(listener) ?? noop,
    [source],
  );
  const snapshot = useCallback(() => read(source), [source]);
  return useSyncExternalStore(subscribe, snapshot, snapshot) ?? (platform || 'TV');
}
