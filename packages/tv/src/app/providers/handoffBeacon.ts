// The beacon this television is waiting under, held where a shared screen may
// read it: the gate screens print it, and they belong to `shared/`, which may
// not reach into a feature. The loop that fills it in is the feature's
// (features/accounts/HandoffBeaconProvider).

import type { HandoffBeaconView } from '@kroma/core';
import { createContext, useContext } from 'react';

export const HandoffBeaconContext = createContext<HandoffBeaconView | null>(null);

/** The beacon this TV is currently waiting under, or null when it is not
 * waiting: signed in, off the local network, or on a server without handoff. */
export function useHandoffBeacon(): HandoffBeaconView | null {
  return useContext(HandoffBeaconContext);
}
