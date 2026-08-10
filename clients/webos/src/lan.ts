// The television's beacon on webOS.
//
// A browser cannot speak DNS-SD, so this shell does not publish the record
// itself: it asks the JS Service packaged beside it (src/beacon-service.cts),
// which is Node and therefore has the UDP socket that multicast DNS needs. What
// lands on the link is the same `_kroma-tv._tcp` record an Apple TV or an
// Android TV raises through @kroma/lan-beacon, so a phone browsing for
// televisions finds all three the same way (docs/tv-pairing.md).
//
// Reached through `PalmServiceBridge` rather than `webOS.service.request`, for
// the same reason `deviceName.ts` does: this shell is a Vite build with no
// vendor script, so the `webOS` global that `webOSTV.js` defines is not there,
// while the bus underneath it always is.

import type { LanDiscoveryBridge, LanService } from '@kroma/core';

const SERVICE = 'luna://tv.kroma.webos.service';

interface Bridge {
  onservicecallback: ((message: string) => void) | null;
  call(uri: string, payload: string): void;
}

interface WebOsGlobals {
  PalmServiceBridge?: new () => Bridge;
}

// The bus holds no reference this side of the boundary: a bridge left in a
// function local can be collected before its reply lands. Held until it answers.
const pending = new Set<Bridge>();

function call(uri: string, payload: Record<string, unknown>): boolean {
  const { PalmServiceBridge } = globalThis as unknown as WebOsGlobals;
  if (!PalmServiceBridge) return false;
  const bridge = new PalmServiceBridge();
  pending.add(bridge);
  bridge.onservicecallback = () => {
    pending.delete(bridge);
  };
  bridge.call(uri, JSON.stringify(payload));
  return true;
}

/**
 * This television's DNS-SD stack, or undefined on a build with no bus to reach
 * (the browser preview, a desktop run). Undefined IS the capability check: the
 * handoff loop then falls back to the server, exactly as it does on Tizen.
 */
export function webOsLan(): LanDiscoveryBridge | undefined {
  if (!(globalThis as unknown as WebOsGlobals).PalmServiceBridge) return undefined;
  return {
    publish(service: LanService) {
      call(`${SERVICE}/publish`, { name: service.name, txt: service.txt });
      return () => {
        call(`${SERVICE}/unpublish`, {});
      };
    },
  };
}
