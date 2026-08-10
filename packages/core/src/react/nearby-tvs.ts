// The phone's half of the nearby handoff, as a hook: the TVs it can find by any
// means, and the one call that signs one of them in.
//
// Web and mobile render this very differently and decide identically, so the
// deciding lives here and each shell brings only its own rows. What differs
// between them is what they can look WITH: a browser has the server and nothing
// else, a phone with the native module also has its own link.

import type { KromaClient } from '@kroma/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiscoveredTv, GrantResult, LanDiscoveryBridge } from '../handoff';
import { grantRefusal, lanSource, serverSource, watchNearbyTvs } from '../handoff';

export interface NearbyTvsOptions {
  /** Null stands the watcher down: no session yet, or the screen is not up. */
  client: KromaClient | null;
  /** This device's own DNS-SD stack, when it has one. A phone that can browse
   * finds TVs the server could not place beside it, and grants them with the
   * proof it heard rather than an address the server had to reason about. */
  lan?: LanDiscoveryBridge;
}

export interface NearbyTvs {
  /** Every TV this device could find, merged across the ways it looked and
   * sorted by name. Empty when none are waiting, and empty for a caller the
   * server cannot place beside one either. */
  devices: DiscoveredTv[];
  /** The TV a grant is in flight for, or null. */
  connecting: DiscoveredTv | null;
  /**
   * Sign that TV in, and say how it went. A row with `confirmRequired` needs
   * the check string that TV is printing on its own screen; sent without one
   * the server answers `checkRequired` rather than granting, and `checkRetryable`
   * says which refusals leave the beacon standing for another code.
   *
   * The outcome comes back from the call rather than from a piece of state,
   * because two identical refusals in a row are two answers and would be one
   * state change.
   */
  connect: (device: DiscoveredTv, check?: string) => Promise<GrantResult>;
}

/** Watch for nearby TVs while the picker is open. */
export function useNearbyTvs(opts: NearbyTvsOptions): NearbyTvs {
  const { client, lan } = opts;
  const [rows, setRows] = useState<DiscoveredTv[]>([]);
  const [connecting, setConnecting] = useState<DiscoveredTv | null>(null);
  // Which install this phone is signed in to. A television heard on the link
  // may belong to a DIFFERENT server (a household with two, a laptop running
  // one), and its handle means nothing to this one.
  const [ourServer, setOurServer] = useState<string | null>(null);

  useEffect(() => {
    if (!client) {
      setOurServer(null);
      return;
    }
    let cancelled = false;
    client
      .health()
      .then((h) => {
        if (!cancelled) setOurServer(h.instanceId ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client]);

  const sources = useMemo(() => {
    if (!client) return [];
    return lan?.browse ? [serverSource(client), lanSource(lan)] : [serverSource(client)];
  }, [client, lan]);

  useEffect(() => {
    if (sources.length === 0) {
      setRows([]);
      return;
    }
    return watchNearbyTvs({ sources, onRows: setRows });
  }, [sources]);

  // A row heard on the link says which install minted it. Anything from another
  // server is dropped rather than offered as a tap that can only answer "no
  // longer waiting". Filtered on the way OUT: learning our own id a beat after
  // mount would otherwise tear every source down and start it again, which
  // costs a duplicate poll and a link browse that can blink the list empty.
  const devices = useMemo(
    () => rows.filter((row) => !row.server || !ourServer || row.server === ourServer),
    [rows, ourServer],
  );

  // A row stays pressable while its grant is in flight, so without this a
  // double tap grants twice: the second either takes a second session or fails,
  // and the picker then shows success and failure at once. Read through a ref
  // rather than state, because two taps can land inside one render.
  const inFlight = useRef(false);

  const connect = useCallback(
    async (device: DiscoveredTv, check?: string): Promise<GrantResult> => {
      if (!client || inFlight.current) return 'dropped';
      inFlight.current = true;
      setConnecting(device);
      try {
        await client.handoffGrant(device.handle, { proof: device.proof, check });
        // The beacon is consumed server-side; drop the row now rather than
        // leaving a TV in the list that is already signing in.
        setRows((current) => current.filter((row) => row.handle !== device.handle));
        return 'granted';
      } catch (cause) {
        return grantRefusal(cause);
      } finally {
        inFlight.current = false;
        setConnecting(null);
      }
    },
    [client],
  );

  return { devices, connecting, connect };
}
