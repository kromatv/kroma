// What the cast picker learns from this device's own link, kept out of
// `cast.tsx` so the provider stays a wiring step.
//
// Two things, and only the second changes what the picker can DO:
//
// - a signed-in television heard here is already the server's to describe, so
//   hearing it is worth exactly one thing: refetch the roster NOW rather than
//   wait for the next beat. Commands still travel through the server, which is
//   the only party that knows whose television it is.
// - a signed-OUT television is invisible to the roster by definition, and is
//   the reason a picker can read "no televisions available" with one sitting in
//   the room. Those rows are worth showing, with the one action that helps.

import type { DiscoveredTv, LanBeacons, LanDiscoveryBridge } from '@kroma/core';
import { watchLanBeacons } from '@kroma/core';
import { useEffect, useEffectEvent, useState } from 'react';
import { AppState } from 'react-native';

export interface LanCastOptions {
  /** This device's DNS-SD stack, when it has one. Absent everywhere else, and
   * everything below then reports nothing. */
  lan?: LanDiscoveryBridge;
  /** Gates on being signed in, like the roster it accelerates. */
  enabled: boolean;
  /** Called when a signed-in television is heard that the roster has not
   * listed. The provider answers by refetching. */
  onUnknownReceiver: () => void;
  /** Whether the roster already knows a receiver id. Read at call time, so a
   * roster change does not restart the browse. */
  knowsReceiver: (receiverId: string) => boolean;
}

/** The signed-out televisions in the room, and a nudge to refetch when a
 * signed-in one turns up that the server has not mentioned yet.
 *
 * Listens only while the app is in front: the browse is a multicast listener,
 * and on Android a worker thread with it, so a phone in a pocket would
 * otherwise pay for it for the whole signed-in session. */
export function useLanCast(opts: LanCastOptions): DiscoveredTv[] {
  const { lan, enabled, onUnknownReceiver, knowsReceiver } = opts;
  const [pairable, setPairable] = useState<DiscoveredTv[]>([]);
  const inFront = useForeground();

  // An effect event: the browse outlives any particular roster, so what it
  // needs from the provider is read at call time rather than captured in the
  // effect's deps.
  const report = useEffectEvent((beacons: LanBeacons) => {
    // The same televisions keep the same array. This list is part of the cast
    // context's value, so a fresh one per report re-renders every screen
    // holding a cast button for a list that has not changed.
    setPairable((held) => (sameTvs(held, beacons.pairable) ? held : beacons.pairable));
    // One nudge per report, however many strangers it held: the refetch it
    // triggers answers for all of them.
    if (beacons.receivers.some((row) => !knowsReceiver(row.receiverId))) {
      onUnknownReceiver();
    }
  });

  useEffect(() => {
    if (!enabled || !inFront || !lan?.browse) {
      setPairable((held) => (held.length === 0 ? held : []));
      return;
    }

    return watchLanBeacons(lan, report);
  }, [lan, enabled, inFront]);

  return pairable;
}

function sameTvs(held: readonly DiscoveredTv[], found: readonly DiscoveredTv[]): boolean {
  return (
    held.length === found.length &&
    held.every((row, at) => {
      const next = found[at];
      return (
        next !== undefined &&
        row.handle === next.handle &&
        row.name === next.name &&
        row.platform === next.platform &&
        row.check === next.check &&
        row.proof === next.proof &&
        row.server === next.server
      );
    })
  );
}

// `inactive` is the app switcher and the pull-down shade on iOS, a second of
// nothing rather than a departure: tearing the browse down for it would restart
// it as fast as it stopped.
function useForeground(): boolean {
  const [inFront, setInFront] = useState(() => AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setInFront(state !== 'background');
    });
    return () => sub?.remove();
  }, []);
  return inFront;
}
