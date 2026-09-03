// This module's wire types. `@kroma/core` does not model remote access: a
// module owns the shape of its own API.

import { z } from 'zod';

/** Live state of the supervised `cloudflared` child; never carries the token. */
export const RemoteConnectorStatus = z.object({
  running: z.boolean(),
  connecting: z.boolean(),
  since: z.string().nullish(),
  lastError: z.string().nullish(),
  binaryFound: z.boolean(),
  binaryVersion: z.string().nullish(),
  logs: z.array(z.string()),
});
export type RemoteConnectorStatus = z.infer<typeof RemoteConnectorStatus>;

export const RemoteAccessView = z.object({
  enabled: z.boolean(),
  url: z.string(),
  hasToken: z.boolean(),
  status: RemoteConnectorStatus,
});
export type RemoteAccessView = z.infer<typeof RemoteAccessView>;
