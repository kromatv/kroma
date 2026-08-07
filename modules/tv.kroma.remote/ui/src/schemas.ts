// This module's wire types. `@kroma/core` does not model remote access — a
// module owns the shape of its own API.

/** Live state of the supervised `cloudflared` child; never carries the token. */
export interface RemoteConnectorStatus {
  running: boolean;
  connecting: boolean;
  since?: string | null;
  lastError?: string | null;
  binaryFound: boolean;
  binaryVersion?: string | null;
  logs: string[];
}

export interface RemoteAccessView {
  enabled: boolean;
  url: string;
  hasToken: boolean;
  status: RemoteConnectorStatus;
}
