// This module's wire types. `@kroma/core` does not model a Roku: a module
// owns the shape of its own API.

import { z } from 'zod';

export const InstallStatus = z.enum(['none', 'installing', 'installed', 'failed']).catch('none');
export type InstallStatus = z.infer<typeof InstallStatus>;

export const RokuInstall = z.object({
  status: InstallStatus,
  message: z.string().nullish(),
  at: z.string().nullish(),
});
export type RokuInstall = z.infer<typeof RokuInstall>;

export const RokuDevice = z.object({
  serial: z.string(),
  name: z.string(),
  model: z.string(),
  ip: z.string(),
  softwareVersion: z.string(),
  developerEnabled: z.boolean(),
  lastSeen: z.string(),
  install: RokuInstall,
});
export type RokuDevice = z.infer<typeof RokuDevice>;

export const RokuView = z.object({
  serverUrl: z.string().nullish(),
  hasPassword: z.boolean(),
  devices: z.array(RokuDevice),
});
export type RokuView = z.infer<typeof RokuView>;
