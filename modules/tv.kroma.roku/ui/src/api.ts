// This module's own admin API, served by its sidecar under the mount the host
// derives from its id; `moduleApiHook` binds it, so the id is never repeated
// here.

import { moduleApiHook } from '@kroma/module-sdk';
import { RokuView } from './schemas';

export const useRokuApi = moduleApiHook((api) => ({
  status: () => api.get('/roku', RokuView),
  /** Answers once every box on the network has been asked who it is. */
  scan: () => api.post('/roku/scan', {}, RokuView),
  /** Asks one box by address, for a network where multicast never arrives. */
  add: (ip: string) => api.post('/roku/add', { ip }, RokuView),
  savePassword: (password: string) => api.put('/roku', { password }, RokuView),
  /** Answers once the box accepted or refused the channel, and launched it. */
  install: (serial: string) => api.post(`/roku/${serial}/install`, {}, RokuView),
  launch: (serial: string) => api.post(`/roku/${serial}/launch`, {}, RokuView),
}));
