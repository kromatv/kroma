// This module's own admin API. The routes belong to the module, not to the core
// client: they are served by its sidecar under the mount the host derives from
// its id, which `moduleApiHook` binds without the module naming itself.

import { moduleApiHook } from '@kroma/module-sdk';
import type { SaveVpnBody, VpnAdminView, VpnTestResult } from './schemas';

export const useVpnApi = moduleApiHook((api) => ({
  status: () => api.get<VpnAdminView>('/vpn'),
  /** Store the WireGuard config (write-only; "" removes it) and restart the
   *  bridge + embedded engine. */
  save: (body: SaveVpnBody) => api.put<{ wgConfigured: boolean }>('/vpn', body),
  /** Live seal probe: exit IP through the proxy vs direct. */
  test: () => api.post<VpnTestResult>('/vpn/test'),
}));
