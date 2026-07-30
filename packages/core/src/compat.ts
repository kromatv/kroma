// Client -> server version compatibility, shared by every client. The check is
// client-led: each build carries the oldest server it works with and compares the
// connected server's version against it. Anything unknown counts as compatible.

/** Only the leading numeric parts matter; a trailing suffix (`-rc1`, git hash, …)
 * is ignored. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parts = (v: string): number[] =>
    v
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

export interface ClientBuild {
  version: string;
  minServerVersion: string;
}

export type CompatVerdict = 'ok' | 'server-outdated';

function isReal(v: string | undefined | null): v is string {
  return !!v && v !== 'unknown' && v !== '0.0.0' && v !== 'dev';
}

export function checkServerCompat(client: ClientBuild, serverVersion: string): CompatVerdict {
  if (
    isReal(serverVersion) &&
    isReal(client.minServerVersion) &&
    compareVersions(serverVersion, client.minServerVersion) < 0
  ) {
    return 'server-outdated';
  }
  return 'ok';
}
