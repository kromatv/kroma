import type { VpnBandwidthView } from './schemas';

export type SealNote =
  | { kind: 'noBridge' }
  | { kind: 'leaked'; bytes: number }
  | { kind: 'gap'; secs: number }
  | { kind: 'sealed' };

/** The verdict for `view`'s whole window, worst case first. */
export function sealNote(view: VpnBandwidthView): SealNote {
  if (!view.bridgeConfigured) return { kind: 'noBridge' };
  const bytes = view.totals.unsealedDownBytes + view.totals.unsealedUpBytes;
  if (bytes > 0) return { kind: 'leaked', bytes };
  if (view.totals.unsealedSecs > 0) return { kind: 'gap', secs: view.totals.unsealedSecs };
  return { kind: 'sealed' };
}

/** Bytes that moved on a download client the bridge never carries, which is
 *  zero on the usual single-engine install. */
export function bypassedBytes(view: VpnBandwidthView): number {
  return view.totals.bypassDownBytes + view.totals.bypassUpBytes;
}
