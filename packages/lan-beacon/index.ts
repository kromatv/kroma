// The JS face of the DNS-SD beacon, shaped as the `LanDiscoveryBridge` that
// `@kroma/core` defines and nothing else.
//
// `requireOptionalNativeModule`, like the server-discovery module beside it: a
// build without the native half (a browser shell, a binary from before this
// existed) gets null rather than a throw, and null IS the capability check. No
// module, no link discovery, and handoff falls back to the server that has been
// carrying it all along.

import type { LanDiscoveryBridge, LanService } from '@kroma/core';
import { type NativeModule, requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

// Distinct from the server's `_kroma._tcp`: what is advertised here is a
// television waiting for an account, not a server offering a library. Both
// halves hardcode it, because Apple wants the type declared in Info.plist
// before a browse is permitted at all and so it cannot be a runtime argument.
export const SERVICE_TYPE = '_kroma-tv._tcp';

declare class LanBeaconNativeModule extends NativeModule<{
  // Emitted on every change to what is audible, carrying the whole current view
  // rather than a delta: a browser that missed a departure would otherwise show
  // a television that has gone.
  'lan-beacon:found': (event: { services: LanService[]; epoch: number }) => void;
}> {
  publish(name: string, txt: Record<string, string>): void;
  unpublish(): void;
  startBrowse(epoch: number): void;
  stopBrowse(): void;
}

const native = requireOptionalNativeModule<LanBeaconNativeModule>('LanBeacon');

/**
 * This device's DNS-SD stack, or null on a target without the native half.
 *
 * Pass it to `useNearbyTvs({ lan })` on a telephone and to `startHandoff({
 * publish })` on a television; a shell that has neither passes nothing and
 * every path still works.
 */
export const lanBeacon: LanDiscoveryBridge | null = native ? bridge(native) : null;

/**
 * The native side holds ONE browser and ONE published record, but a phone has
 * more than one caller: the cast picker browses for the whole signed-in session
 * while the pairing screen browses whenever it is open. Handing each of them a
 * `stop` that calls `native.stopBrowse()` would let whichever closed first
 * cancel the other's browse, and the survivor would never learn, never restart,
 * and quietly report nothing for the rest of the session.
 *
 * So the browse is reference-counted here: the native browser starts on the
 * first caller and stops on the last, and every caller gets the full view. The
 * published record is a single slot by nature (a device is in one state), so it
 * is tracked by owner instead: releasing a record that has already been replaced
 * must not take down its replacement.
 */
// Android 13 moved network service discovery behind a RUNTIME permission, so a
// manifest entry alone leaves `discoverServices`/`registerService` failing on
// every modern phone and television. Asked once; a refusal simply leaves the
// server path doing the work it was already doing.
async function allowedNearby(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  try {
    const granted = await PermissionsAndroid.request(
      'android.permission.NEARBY_WIFI_DEVICES' as never,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

function bridge(module: LanBeaconNativeModule): LanDiscoveryBridge {
  const listeners = new Set<(services: LanService[]) => void>();
  let subscription: { remove: () => void } | null = null;
  // The last view, so a caller arriving mid-session is not left blank until the
  // link happens to change.
  let latest: LanService[] = [];
  let published: symbol | null = null;
  // Names the browse the native side is running for us, and moves on whenever
  // one is started or stopped. A browse that has been told to stop can still
  // report (a worker parked in a resolve, a listener torn down mid-flight) and
  // the event channel is shared, so a report is only ours if it names this one.
  let epoch = 0;

  return {
    publish(service) {
      const owner = Symbol('lan-beacon record');
      published = owner;
      void allowedNearby().then((allowed) => {
        // Still ours by the time the answer came back?
        if (allowed && published === owner) module.publish(service.name, service.txt);
      });
      return () => {
        // Someone else's record is up now; theirs is not ours to take down.
        if (published !== owner) return;
        published = null;
        module.unpublish();
      };
    },

    browse(onFound) {
      listeners.add(onFound);
      if (listeners.size === 1) {
        subscription = module.addListener('lan-beacon:found', (event) => {
          if (event.epoch !== epoch) return;
          latest = event.services;
          for (const listener of listeners) listener(latest);
        });
        void allowedNearby().then((allowed) => {
          if (!allowed || listeners.size === 0) return;
          epoch += 1;
          module.startBrowse(epoch);
        });
      } else {
        onFound(latest);
      }

      let released = false;
      return () => {
        if (released) return;
        released = true;
        listeners.delete(onFound);
        if (listeners.size > 0) return;
        subscription?.remove();
        subscription = null;
        latest = [];
        epoch += 1;
        module.stopBrowse();
      };
    },
  };
}
