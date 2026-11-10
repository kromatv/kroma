// This module's own admin API. The routes belong to the module, not to the core
// client: they are served by the module under the mount the host derives from
// its id, which `moduleApiHook` binds without the module naming itself.

import { moduleApiHook } from '@kromatv/module-sdk';
import {
  type MullvadConnectBody,
  MullvadConnectResult,
  MullvadLocations,
  type MullvadPlaceBody,
  SavedConfigs,
  type SaveVpnBody,
  SaveVpnResult,
  VpnAdminView,
  type VpnBandwidthRange,
  VpnBandwidthView,
  VpnTestResult,
} from './schemas';

export const useVpnApi = moduleApiHook((api) => ({
  status: () => api.get('/vpn', VpnAdminView),
  /** Store the WireGuard config (write-only; "" removes it) and restart the
   *  bridge + embedded engine. */
  save: (body: SaveVpnBody) => api.put('/vpn', body, SaveVpnResult),
  /** Live seal probe: exit IP through the proxy vs direct. */
  test: () => api.post('/vpn/test', undefined, VpnTestResult),
  /** Every country and city Mullvad can take the tunnel to. */
  mullvadLocations: () => api.get('/vpn/mullvad/locations', MullvadLocations),
  /** Connect through Mullvad, registering this server on the account the first
   *  time. A refusal is a 4xx whose body is a `MullvadRefusal`. */
  mullvadConnect: (body: MullvadConnectBody) =>
    api.post('/vpn/mullvad', body, MullvadConnectResult),
  /** Keep another place on this server's Mullvad device as a tunnel of its own
   *  that a network rule can name. Costs no device on the account. */
  mullvadAddToRouter: (body: MullvadPlaceBody) =>
    api.post('/vpn/mullvad/router', body, SavedConfigs),
  /** Remove this server from the Mullvad account and stop the tunnel. */
  mullvadDisconnect: () => api.delete('/vpn/mullvad'),
  /** Free one of the account's device slots. */
  mullvadRemoveDevice: (accountNumber: string, deviceId: string) =>
    api.post('/vpn/mullvad/devices/remove', { accountNumber, deviceId }),
  /** Keep WireGuard configs for one-click switching; with `use`, the first one
   *  becomes the tunnel's at once. */
  saveConfigs: (configs: string[], use: boolean) =>
    api.post('/vpn/saved', { configs, use }, SavedConfigs),
  /** Switch the tunnel to a kept config. */
  useSaved: (id: string) => api.post(`/vpn/saved/${encodeURIComponent(id)}/use`, {}, SavedConfigs),
  /** Give a kept config a tunnel of its own that a network rule can pick, or
   *  take it back. A full router answers 409 `{ code: "routerFull", max }`. */
  setRoutable: (id: string, on: boolean) =>
    api.put(`/vpn/saved/${encodeURIComponent(id)}/network`, { on }, SavedConfigs),
  /** Forget a kept config; the tunnel stops when it was the one in use. */
  removeSaved: (id: string) => api.delete(`/vpn/saved/${encodeURIComponent(id)}`, SavedConfigs),
  /** `null` when no download module is installed to answer. */
  bandwidth: (range: VpnBandwidthRange) =>
    api.get(`/vpn/bandwidth?range=${range}`, VpnBandwidthView.nullable()),
}));
