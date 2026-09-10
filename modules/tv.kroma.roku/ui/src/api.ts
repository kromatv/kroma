import { moduleApiHook } from '@kromatv/module-sdk';
import { RokuView } from './schemas';

export const useRokuApi = moduleApiHook((api) => ({
  status: () => api.get('/roku', RokuView),
  scan: () => api.post('/roku/scan', {}, RokuView),
  add: (ip: string) => api.post('/roku/add', { ip }, RokuView),
  savePassword: (password: string) => api.put('/roku', { password }, RokuView),
  install: (serial: string) => api.post(`/roku/${serial}/install`, {}, RokuView),
  launch: (serial: string) => api.post(`/roku/${serial}/launch`, {}, RokuView),
}));
