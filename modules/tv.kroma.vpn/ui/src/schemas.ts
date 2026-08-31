// This module's wire types. They live here, not in `@kroma/core`, because the
// core client has no business knowing what a VPN is: a module owns the shape
// of its own API. Modules that read this one's status (the downloads module
// shows it beside the queue) import it from this package by name.

import { z } from 'zod';

/** The kill switch's view of the tunnel. */
export const VpnStatusView = z.object({
  connected: z.boolean(),
  exitIp: z.string().nullable(),
  paused: z.boolean(),
});
export type VpnStatusView = z.infer<typeof VpnStatusView>;

/** `POST /test`: a live probe through (and around) the proxy. */
export const VpnTestResult = z.object({
  sealed: z.boolean(),
  proxiedIp: z.string().nullable(),
  directIp: z.string().nullable(),
  error: z.string().nullable(),
});
export type VpnTestResult = z.infer<typeof VpnTestResult>;

/** `GET /vpn`: the VPN configuration card's state. */
export const VpnAdminView = z.object({
  wgConfigured: z.boolean(),
  bridgeRunning: z.boolean(),
  localPort: z.number(),
  status: VpnStatusView.nullable(),
});
export type VpnAdminView = z.infer<typeof VpnAdminView>;

/** `PUT /vpn` body. `wgConfig` is write-only. */
export const SaveVpnBody = z.object({
  wgConfig: z.string().nullable(),
  localPort: z.number().nullable(),
});
export type SaveVpnBody = z.infer<typeof SaveVpnBody>;

export const VpnBandwidthRange = z.enum(['12h', '24h', '7d', '30d', '90d', '1y', 'all']);
export type VpnBandwidthRange = z.infer<typeof VpnBandwidthRange>;

const bucketed = z.array(z.number()).catch([]);

/** One value per bucket, oldest first, every field the same length. */
export const VpnBandwidthSeries = z.object({
  sealedDown: bucketed,
  sealedUp: bucketed,
  unsealedDown: bucketed,
  unsealedUp: bucketed,
  bypassDown: bucketed,
  bypassUp: bucketed,
  unsealedSecs: bucketed,
});
export type VpnBandwidthSeries = z.infer<typeof VpnBandwidthSeries>;

export const VpnBandwidthTotals = z.object({
  sealedDownBytes: z.number(),
  sealedUpBytes: z.number(),
  unsealedDownBytes: z.number(),
  unsealedUpBytes: z.number(),
  bypassDownBytes: z.number(),
  bypassUpBytes: z.number(),
  sealedSecs: z.number(),
  unsealedSecs: z.number(),
});
export type VpnBandwidthTotals = z.infer<typeof VpnBandwidthTotals>;

/** `sealed` moved through the bridge with the seal holding, `unsealed` moved on
 *  the engine the bridge carries while it did not, and `bypass` on an engine it
 *  never carries. */
export const VpnBandwidthView = z.object({
  range: VpnBandwidthRange.catch('24h'),
  startedAt: z.number(),
  stepSecs: z.number(),
  series: VpnBandwidthSeries,
  totals: VpnBandwidthTotals,
  bridgeConfigured: z.boolean(),
});
export type VpnBandwidthView = z.infer<typeof VpnBandwidthView>;

/** The `vpn.status` frame this module's backend pushes on the event socket. */
export interface VpnStatusEvent {
  type: 'vpn.status';
  connected: boolean;
  exitIp: string | null;
  paused: boolean;
}
