// This module's wire types. They live here, not in `@kromatv/core`, because the
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

/** Which provider the stored tunnel belongs to: the Mullvad place this server
 * connected itself to, or a Proton VPN file recognised by its comments. Never
 * carries a key or an account number. */
export const VpnProvider = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('mullvad'),
    country: z.string(),
    countryName: z.string(),
    city: z.string().nullable(),
    cityName: z.string().nullable(),
    hostname: z.string(),
    deviceName: z.string(),
  }),
  z.object({
    kind: z.literal('proton'),
    server: z.string().nullable(),
    portForwarding: z.boolean(),
  }),
]);
export type VpnProvider = z.infer<typeof VpnProvider>;

/** A WireGuard config kept on the server for one-click switching. Its text
 * never leaves the server: this is what it is, whether it is in use, and
 * whether it runs a tunnel of its own that a network rule can pick. */
export const SavedConfig = z.object({
  id: z.string(),
  label: z.string(),
  provider: VpnProvider.nullable(),
  active: z.boolean(),
  routable: z.boolean(),
});
export type SavedConfig = z.infer<typeof SavedConfig>;

export const SavedConfigs = z.object({ saved: z.array(SavedConfig) });
export type SavedConfigs = z.infer<typeof SavedConfigs>;

/** `GET /vpn`: the VPN configuration card's state. */
export const VpnAdminView = z.object({
  provider: VpnProvider.nullable(),
  saved: z.array(SavedConfig),
  routerSlots: z.number().int(),
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

export const SaveVpnResult = z.object({
  wgConfigured: z.boolean(),
});
export type SaveVpnResult = z.infer<typeof SaveVpnResult>;

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

/** A place Mullvad can take the tunnel to. `owned`: Mullvad owns at least one
 * server there outright rather than renting it. */
export const MullvadCity = z.object({ code: z.string(), name: z.string(), owned: z.boolean() });
export type MullvadCity = z.infer<typeof MullvadCity>;

export const MullvadCountry = z.object({
  code: z.string(),
  name: z.string(),
  owned: z.boolean(),
  cities: z.array(MullvadCity),
});
export type MullvadCountry = z.infer<typeof MullvadCountry>;

/** `GET /vpn/mullvad/locations`. */
export const MullvadLocations = z.object({ countries: z.array(MullvadCountry) });
export type MullvadLocations = z.infer<typeof MullvadLocations>;

/** `POST /vpn/mullvad` body. The account number is needed the first time only. */
export const MullvadConnectBody = z.object({
  accountNumber: z.string().nullable(),
  country: z.string(),
  city: z.string().nullable(),
  ownedOnly: z.boolean(),
});
export type MullvadConnectBody = z.infer<typeof MullvadConnectBody>;

/** `POST /vpn/mullvad/router` body: another place for this server's device. */
export const MullvadPlaceBody = MullvadConnectBody.omit({ accountNumber: true });
export type MullvadPlaceBody = z.infer<typeof MullvadPlaceBody>;

/** The 409 a full router answers: it holds `max` configs besides the default. */
export const RouterFull = z.object({ code: z.literal('routerFull'), max: z.number().int() });
export type RouterFull = z.infer<typeof RouterFull>;

export const MullvadConnectResult = z.object({ provider: VpnProvider.nullable() });
export type MullvadConnectResult = z.infer<typeof MullvadConnectResult>;

/** One device on the Mullvad account, offered for removal when every slot is taken. */
export const MullvadDevice = z.object({ id: z.string(), name: z.string(), created: z.string() });
export type MullvadDevice = z.infer<typeof MullvadDevice>;

/** Why Mullvad did not connect: the body of a refused `POST /vpn/mullvad`. */
export const MullvadRefusal = z.object({
  code: z.enum([
    'accountNeeded',
    'invalidAccount',
    'maxDevices',
    'noRelay',
    'throttled',
    'unavailable',
  ]),
  devices: z.array(MullvadDevice).optional(),
  detail: z.string().optional(),
});
export type MullvadRefusal = z.infer<typeof MullvadRefusal>;
