// Version compatibility between an app and its server, read from both sides:
// each build carries the oldest server it works with, and a server states the
// oldest app it serves. Anything unknown counts as compatible.

/** Only the leading numeric parts matter, so a canary compares as the release
 * it leads to: `0.1.39-canary.4` is 0.1.39. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parts = (v: string): number[] =>
    (v.split(/[-+]/)[0] ?? '')
      .split('.')
      .map((p) => Number.parseInt(p, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** What this build knows about itself: its version, and the oldest server it
 * works with, which a shell that has never needed one leaves out. */
export interface ClientBuild {
  version: string;
  minServerVersion?: string;
}

/** What `/api/health` says about the server: its version, and the oldest app
 * it serves, which a server from before it said leaves out. */
export interface ServerBuild {
  version: string;
  minClient?: string | null;
}

export type CompatVerdict = 'ok' | 'server-outdated' | 'client-outdated';

function isReal(v: string | undefined | null): v is string {
  return !!v && v !== 'unknown' && v !== '0.0.0' && v !== 'dev';
}

/** The server's word comes first: an app it no longer serves is told so even
 * when that app would also have wanted a newer server. */
export function checkCompat(client: ClientBuild, server: ServerBuild): CompatVerdict {
  if (
    isReal(client.version) &&
    isReal(server.minClient) &&
    compareVersions(client.version, server.minClient) < 0
  ) {
    return 'client-outdated';
  }
  if (
    isReal(server.version) &&
    isReal(client.minServerVersion) &&
    compareVersions(server.version, client.minServerVersion) < 0
  ) {
    return 'server-outdated';
  }
  return 'ok';
}
