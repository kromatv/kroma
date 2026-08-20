// The TV's half of the nearby handoff: publish a beacon while signed out, poll
// it, and sign in the moment a phone next to it grants an account.
//
// The beacon goes up in two places at once where the platform allows it: at the
// server, which any phone can list, and on the link itself as a DNS-SD record,
// which only a phone in the same room can hear. The second is optional and the
// first is not, because the grant travels through the server either way.

import { type AuthResult, KromaApiError, type KromaClient } from '@kroma/client';
import { beaconTxt, type LanDiscoveryBridge } from './sources';

/** What the gate screens show while the TV waits: the name a phone sees, and
 * the check string that says which row in that list is this TV. */
export interface HandoffBeaconView {
  name: string;
  check: string;
}

export interface HandoffLoopOptions {
  client: KromaClient;
  deviceId: string;
  /** Publish the beacon on this device's own link as well, when the platform
   * has a DNS-SD stack to publish it with. A phone that hears the record has
   * proved it is in the room, which is worth more than any address the server
   * can infer, so this is what makes handoff work across a routed home or a
   * dual-stack one. Absent on a shell that cannot publish. */
  publish?: NonNullable<LanDiscoveryBridge['publish']>;
  /** What this TV calls itself in the phone's list. */
  name: string;
  platform: string;
  /** The beacon to show, or null while there is none: announcing, or refused.
   * A refusal the server will not take back stops the loop for good. */
  onBeacon: (beacon: HandoffBeaconView | null) => void;
  onAuthenticated: (result: AuthResult) => void;
}

// How long to wait before announcing again after the server did not answer, or
// answered something a later try could still turn into a beacon.
const RETRY_MS = 15_000;

// What a server answers a television that will never raise a beacon on it: this
// origin may not announce (403), the route wants a session (401), or the server
// predates handoff (404). A full network (429), a 5xx and a dropped request are
// all worth waiting out instead.
const FINAL_REFUSALS = new Set([401, 403, 404]);

const refusedForGood = (cause: unknown) =>
  cause instanceof KromaApiError && FINAL_REFUSALS.has(cause.status);

/** The running beacon. */
export interface HandoffBeaconHandle {
  /** Take it down, rather than leave it on every nearby phone until its TTL:
   * the TV signed in, or the screen went away. */
  stop(): void;
  /** Say it under another name. The platform is often slower than the first
   * announce - webOS and Tizen both answer through a bus callback - so the
   * beacon that went up under "webOS" has to become the one under "Salon"
   * without a phone ever holding both. */
  rename(next: string): void;
}

/** Start announcing this TV and watching for a grant. */
export function startHandoff(opts: HandoffLoopOptions): HandoffBeaconHandle {
  const { client, deviceId, platform, publish, onBeacon, onAuthenticated } = opts;
  let name = opts.name;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let secret = '';
  let unpublish: (() => void) | undefined;
  // Which announce is the current one. A reply to a superseded round (a rename
  // landed while it was in flight) is taken down rather than left running a
  // second loop against a beacon nothing shows.
  let round = 0;

  const stale = (mine: number) => stopped || mine !== round;

  // Every beacon gets its own record, so a rotated one never leaves a stale
  // handle audible on the link. A device has only one record: this is the
  // signed-OUT one, and the cast receiver publishes the signed-in one. The two
  // never overlap (see CastReceiverProvider).
  const republish = (record: Parameters<typeof beaconTxt>[0] | null) => {
    unpublish?.();
    unpublish = undefined;
    if (!record || !publish) return;
    try {
      unpublish = publish({ name: record.name || 'KROMA', txt: beaconTxt(record) });
    } catch {
      // A platform that refuses to publish (no permission, no multicast) still
      // pairs through the server.
    }
  };

  // The one place a next step is scheduled, and so the one place that has to
  // notice the loop was stopped while a request was in flight.
  const wait = (ms: number, run: () => void) => {
    if (stopped) return;
    timer = setTimeout(run, ms);
  };

  const disarm = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const shutDown = () => {
    stopped = true;
    disarm();
    republish(null);
    onBeacon(null);
  };

  const poll = async (mine: number, every: number) => {
    try {
      const status = await client.handoffPoll(secret);
      if (stale(mine)) return;
      if (status.status === 'authorized') {
        // Collected: the beacon is already consumed server-side, so there is
        // nothing left to take down.
        secret = '';
        republish(null);
        onBeacon(null);
        onAuthenticated({
          token: status.token,
          accessToken: status.accessToken,
          user: status.user,
        });
        return;
      }
      if (status.status === 'expired') {
        void begin();
        return;
      }
    } catch (cause) {
      if (stale(mine)) return;
      if (refusedForGood(cause)) {
        // Nothing can poll this beacon and nothing can take it down either. It
        // lapses on its own once this stops asking after it.
        secret = '';
        shutDown();
        return;
      }
      // A dropped poll is not a lapsed beacon: keep the current one and retry.
    }
    wait(every, () => void poll(mine, every));
  };

  const begin = async () => {
    const mine = ++round;
    try {
      // Passing the outgoing secret retires that beacon up front, so a phone
      // looking at the list never sees this TV twice.
      const beacon = await client.announceHandoff({
        deviceId,
        name,
        platform,
        ...(secret ? { prevSecret: secret } : {}),
      });
      if (stale(mine)) {
        // Nothing holds this reply any more, and a beacon left standing keeps a
        // row in every nearby picker for its full TTL. Take it down.
        client.handoffLeave(beacon.secret).catch(() => undefined);
        return;
      }
      secret = beacon.secret;
      republish({
        state: 'waiting',
        handle: beacon.handle,
        name,
        platform,
        // Which install minted the handle: a phone whose server is a different
        // one cannot grant it, and should not be shown a row it can only fail
        // to use.
        server: beacon.instanceId,
        check: beacon.check,
        proof: beacon.proof,
      });
      onBeacon({ name, check: beacon.check });
      wait(beacon.pollSecs * 1000, () => void poll(mine, beacon.pollSecs * 1000));
    } catch (cause) {
      if (stale(mine)) return;
      secret = '';
      if (refusedForGood(cause)) {
        // Asking again would only be refused again; the code + QR on screen
        // still pair this TV.
        shutDown();
        return;
      }
      republish(null);
      onBeacon(null);
      wait(RETRY_MS, () => void begin());
    }
  };

  void begin();

  return {
    stop() {
      shutDown();
      if (secret) {
        const going = secret;
        secret = '';
        client.handoffLeave(going).catch(() => undefined);
      }
    },
    rename(next: string) {
      if (stopped || next === name) return;
      name = next;
      disarm();
      void begin();
    },
  };
}
