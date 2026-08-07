// This module's own admin API, served by its sidecar under the mount the host
// derives from its id — `moduleApiHook` binds it, so the id is never repeated
// here.

import { moduleApiHook } from '@kroma/module-sdk';
import type { RemoteAccessView } from './schemas';

/** A blank/omitted `token` keeps the stored one; an empty field never wipes it. */
export interface RemoteAccessSave {
  enabled: boolean;
  url: string;
  token?: string;
}

export const useRemoteApi = moduleApiHook((api) => ({
  status: () => api.get<RemoteAccessView>('/remote'),
  /** Returns before the connector has reacted: the server reconciles `enabled`
   *  asynchronously, so the status may still be the old one. */
  save: (body: RemoteAccessSave) => api.put<RemoteAccessView>('/remote', body),
}));
