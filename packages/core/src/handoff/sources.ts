// Where the list of waiting TVs comes from, and the one shape every way of
// finding them answers in.
//
// There are two levels here on purpose:
//
// - `TvDiscoverySource` is the universal port. Anything that can produce rows
//   implements it: the server broker, a DNS-SD browse, and later a vendor TV
//   stack whose shape is nothing like DNS-SD (Samsung's multiscreen channel,
//   LG's Connect SDK). One list, several ways of filling it.
// - `LanDiscoveryBridge` is the narrower shape the DNS-SD family shares. Apple's
//   `NWListener`/`NWBrowser`, Android's `NsdManager` and Rust's `mdns-sd` all
//   publish a named record with a text dictionary and browse for one, so those
//   three platforms share `lanSource` instead of writing it three times.
//
// Nothing here imports a native module. Each shell hands its own bridge in, the
// way `discoverServer` already takes a `browse` hook.

import type { HandoffDevice, KromaClient } from '@kroma/client';
import { BeaconTxt } from '@kroma/client';

/** One waiting TV, however it was found. */
export interface DiscoveredTv extends HandoffDevice {
  /** How this row arrived. `lan` was heard on this link; `server` was listed by
   * the server from what it could tell of the two devices' addresses. */
  via: 'lan' | 'server';
  /** Carried only by `lan` rows: evidence this row was heard on the link, which
   * the grant sends on so the server can accept it in place of its own
   * address check. Never displayed. */
  proof?: string;
  /** Carried only by `lan` rows: which install minted `handle`. A row whose
   * server is not the caller's own cannot be granted, and is dropped rather
   * than offered as a tap that can only fail. */
  server?: string;
}

/** One way of finding TVs. */
export interface TvDiscoverySource {
  readonly id: string;
  /** Start reporting this source's whole view on every change. Returns stop. */
  start(onRows: (rows: DiscoveredTv[]) => void): () => void;
}

/** One DNS-SD record, as every stack in that family describes one. */
export interface LanService {
  name: string;
  txt: Record<string, string>;
}

/**
 * What a platform with a real DNS-SD stack provides. Either half may be absent:
 * a television publishes and never browses, a telephone browses and never
 * publishes, and a shell with neither simply passes nothing.
 *
 * The service type is the native side's business, not this one's: Apple wants it
 * declared in `Info.plist` before a browse is allowed at all, so it cannot be a
 * runtime argument.
 */
export interface LanDiscoveryBridge {
  publish?: (service: LanService) => () => void;
  browse?: (onFound: (services: LanService[]) => void) => () => void;
}

/** What a TV puts in its record, and what a phone reads back out.
 *
 * One record type for both states a television can be in, because a phone
 * looking for televisions wants both answers from one browse: the ones waiting
 * for an account, and the ones already signed in and ready to be cast to. What
 * the phone can DO with a row differs; that it can see the row does not. */
export type BeaconRecord =
  | {
      /** Signed out, and waiting for someone to hand it an account. */
      state: 'waiting';
      name: string;
      platform: string;
      /** The install that minted `handle`, so a phone on a different server
       * knows this row is not one it can sign in. */
      server: string;
      handle: string;
      check: string;
      proof: string;
    }
  | {
      /** Signed in, on the cast roster, ready to be played to. */
      state: 'ready';
      name: string;
      platform: string;
      /** Its id on the cast roster, so a row heard here and a row listed by the
       * server are recognised as one television. */
      receiver: string;
    };

/** One signed-in television heard on the link. Carries no authority: a command
 * still travels through the server, which is the only thing that knows whose
 * television this is. */
export interface NearbyReceiver {
  receiverId: string;
  name: string;
  platform: string;
}

// Bumped if the keys below ever change meaning, so a newer phone can tell an
// older TV's record from one it should ignore.
const RECORD_VERSION = '1';

/** A name from off-device, stripped and optionally capped, for the same reason
 * the server strips what a device tells it: these are drawn in someone else's
 * picker, where a raw newline could forge a line. */
export function safeLabel(value: string | null | undefined, max?: number): string {
  const text = (value ?? '')
    .split('')
    .filter((c) => c >= ' ' && c !== '\u007f')
    .join('')
    .trim();
  return max === undefined ? text : text.slice(0, max).trim();
}

/** The text dictionary a TV publishes. Keys are short, as DNS-SD prefers. */
export function beaconTxt(record: BeaconRecord): Record<string, string> {
  const common = {
    v: RECORD_VERSION,
    state: record.state,
    name: record.name,
    platform: record.platform,
  };
  return record.state === 'waiting'
    ? {
        ...common,
        server: record.server,
        handle: record.handle,
        check: record.check,
        proof: record.proof,
      }
    : { ...common, receiver: record.receiver };
}

/** Read a record back, or null if it is not one this build understands.
 *
 * Anything on the link can publish one of these, so this is a boundary: a record
 * that is malformed, from a future version, or simply too long to be honest is
 * dropped rather than shown half-empty or passed on to the server. */
export function parseBeaconTxt(txt: Record<string, string>): BeaconRecord | null {
  const parsed = BeaconTxt.safeParse(txt);
  if (!parsed.success) return null;
  const record = parsed.data;
  const name = safeLabel(record.name);
  const platform = safeLabel(record.platform);
  return record.state === 'waiting'
    ? {
        state: 'waiting',
        name,
        platform,
        server: record.server,
        handle: record.handle,
        check: record.check,
        proof: record.proof,
      }
    : { state: 'ready', name, platform, receiver: record.receiver };
}

// One browse, projected through `read`. Both callers below want the same
// records and different halves of them.
function watchRecords<T>(
  bridge: LanDiscoveryBridge,
  read: (record: BeaconRecord, service: LanService) => T | null,
  onRows: (rows: T[]) => void,
): () => void {
  const browse = bridge.browse;
  if (!browse) return () => undefined;
  return browse((services) => {
    const rows: T[] = [];
    for (const service of services) {
      const record = parseBeaconTxt(service.txt);
      const row = record && read(record, service);
      if (row) rows.push(row);
    }
    onRows(rows);
  });
}

/** Everything this device can hear, split by what can be done with it. */
export interface LanBeacons {
  /** Televisions with no account, which a phone can sign in. */
  pairable: DiscoveredTv[];
  /** Televisions already signed in. Discovery only: what a sender may command
   * is still the server's to say. */
  receivers: NearbyReceiver[];
}

/**
 * Watch the link once and report both halves.
 *
 * One browse rather than two: a caller that wants both would otherwise stand up
 * two browsers over the same service type, and on a phone that is two multicast
 * listeners for one question.
 */
export function watchLanBeacons(
  bridge: LanDiscoveryBridge,
  onBeacons: (beacons: LanBeacons) => void,
): () => void {
  return watchRecords(
    bridge,
    // A record with no name of its own still has the one the network published
    // it under.
    (record, service) => ({ record, name: record.name || service.name }),
    (rows) => {
      const beacons: LanBeacons = { pairable: [], receivers: [] };
      for (const { record, name } of rows) {
        if (record.state === 'waiting') {
          beacons.pairable.push({
            handle: record.handle,
            name,
            platform: record.platform,
            check: record.check,
            // Not in the record and never taken from one: the server is what
            // says whether a beacon has to be confirmed, and a row heard here
            // has not been placed by it at all. Asking is the closed answer.
            confirmRequired: true,
            via: 'lan',
            proof: record.proof,
            server: record.server,
          });
        } else {
          beacons.receivers.push({
            receiverId: record.receiver,
            name,
            platform: record.platform,
          });
        }
      }
      onBeacons(beacons);
    },
  );
}

/** The TVs the server can see from the two devices' addresses. Works wherever
 * the server does, which is everywhere, and is the only source a browser has. */
export function serverSource(client: KromaClient, everyMs = 3000): TvDiscoverySource {
  return {
    id: 'server',
    start(onRows) {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const wait = () => {
        if (stopped) return;
        timer = setTimeout(() => void tick(), everyMs);
      };

      const tick = async () => {
        try {
          const rows = await client.handoffDevices();
          if (!stopped) onRows(rows.map((row) => ({ ...row, via: 'server' as const })));
        } catch {
          /* keep the last good list: a dropped poll is not a TV going away */
        }
        wait();
      };

      void tick();
      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = undefined;
      };
    },
  };
}

/** The TVs this device can hear on its own link. Stronger evidence of being in
 * the same room than any address comparison: link-local multicast does not
 * cross a router, so a record you heard is a TV you are next to.
 */
export function lanSource(bridge: LanDiscoveryBridge): TvDiscoverySource {
  return {
    id: 'lan',
    start(onRows) {
      return watchLanBeacons(bridge, (beacons) => onRows(beacons.pairable));
    },
  };
}
