/**
 * KROMA's webOS beacon service.
 *
 * The television's UI is a browser, and a browser has no DNS-SD API - so the
 * `_kroma-tv._tcp` record that lets a phone prove it is in the same room (see
 * docs/tv-pairing.md) cannot be raised from the app itself. webOS lets an app
 * ship a JS Service beside its UI, and that service is Node: it has a UDP
 * socket, which is all multicast DNS is. The app asks this service to publish,
 * and the record on the link is the same one an Apple TV or an Android TV
 * raises natively through @kromatv/lan-beacon.
 *
 * Runtime notes: authored as a module and emitted as CommonJS by
 * scripts/build-service.ts, one self-contained file - the same shape the Tizen
 * preview service uses. `webos-service` stays external because the TELEVISION
 * provides it: LG's own service template requires it while declaring no
 * dependency, and it is not on npm at all.
 */

import { type Beacon, publish } from '@kromatv/mdns-beacon';

import Service from 'webos-service';
import { z } from 'zod';

const SERVICE_ID = 'tv.kroma.webos.service';
const txtSchema = z
  .record(z.string().min(1).max(63), z.unknown())
  .refine((value) => Object.keys(value).length <= 64);
const txtValue = z.string().min(1).max(255);

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Register handlers whose active beacon belongs to this Luna service. */
export function registerBeaconService(service: Service): () => void {
  let beacon: Beacon | null = null;
  function stop(): void {
    beacon?.stop();
    beacon = null;
  }

  /** Publish (or re-publish) the beacon. A second call replaces the first: a
   *  television that is renamed announces the new name rather than both. */
  service.register('publish', (message) => {
    const name = text(message.payload.name);
    if (!name) {
      message.respond({ returnValue: false, errorText: 'name required' });
      return;
    }
    const txt: Record<string, string> = {};
    const given = txtSchema.safeParse(message.payload.txt);
    if (given.success) {
      for (const [key, value] of Object.entries(given.data)) {
        const line = txtValue.safeParse(value);
        if (line.success && new TextEncoder().encode(`${key}=${line.data}`).length <= 255) {
          txt[key] = line.data;
        }
      }
    }
    stop();
    beacon = publish({ instance: name, txt });
    message.respond({ returnValue: true });
  });

  service.register('unpublish', (message) => {
    stop();
    message.respond({ returnValue: true });
  });
  return stop;
}

registerBeaconService(new Service(SERVICE_ID));
