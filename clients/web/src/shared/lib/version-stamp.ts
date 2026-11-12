import type { BuildInfo } from 'virtual:build-info';
import type { Health } from '@kromatv/client/media';

/** One running build: the release it belongs to, the build number its CI run
 *  stamped (`null` for a local build), and the commit it came from. */
export interface VersionStamp {
  version: string;
  build: number | null;
  commit: string | null;
  dirty: boolean;
}

/** One line of the version footer. `side` is `null` when the line stands for
 *  both the client and the server. */
export interface StampLine {
  side: string | null;
  text: string;
}

type VersionKey = 'nav.versionClient' | 'nav.versionServer' | 'nav.versionBuild' | 'nav.versionDev';

type Translate = (key: VersionKey, vars?: Record<string, string>) => string;

const known = (commit: string | null | undefined) =>
  commit && commit !== 'unknown' ? commit : null;

/** The web client's own stamp, from `virtual:build-info`. */
export function clientStamp(
  info: Pick<BuildInfo, 'version' | 'build' | 'commit' | 'dirty'>,
): VersionStamp {
  return {
    version: info.version,
    build: info.build,
    commit: known(info.commit),
    dirty: info.dirty,
  };
}

/** The server's stamp, from `/api/health`. An older server sends no commit. */
export function serverStamp(health: Health): VersionStamp {
  return {
    version: health.version,
    build: health.build || null,
    commit: known(health.commit),
    dirty: false,
  };
}

/** Whether the two are one build, which is the case whenever the server
 *  serves its own web client. Local builds share no build number, so their
 *  commits decide. */
export function sameBuild(a: VersionStamp, b: VersionStamp): boolean {
  if (a.version !== b.version || a.build !== b.build) return false;
  if (a.build !== null || !a.commit || !b.commit) return true;
  return a.commit === b.commit;
}

/** `v0.1.39 · build 3488516` for a CI build, `v0.1.39 · dev 1fadb4f` for a
 *  local one. */
export function stampLabel(stamp: VersionStamp, t: Translate): string {
  if (stamp.build !== null)
    return `v${stamp.version} · ${t('nav.versionBuild', { build: String(stamp.build) })}`;
  if (stamp.commit) return `v${stamp.version} · ${t('nav.versionDev', { commit: stamp.commit })}`;
  return `v${stamp.version}`;
}

/** One line while the server is unknown or runs the client's own build, one
 *  line per side once they differ. */
export function stampLines(
  client: VersionStamp,
  server: VersionStamp | null,
  t: Translate,
): StampLine[] {
  if (!server || sameBuild(client, server)) return [{ side: null, text: stampLabel(client, t) }];
  return [
    { side: t('nav.versionClient'), text: stampLabel(client, t) },
    { side: t('nav.versionServer'), text: stampLabel(server, t) },
  ];
}

function describe(stamp: VersionStamp): string {
  const version = stamp.build === null ? stamp.version : `${stamp.version}.${stamp.build}`;
  if (!stamp.commit) return version;
  return `${version} (${stamp.commit}${stamp.dirty ? '-dirty' : ''})`;
}

/** What a bug report pastes to name both builds exactly, in the shape the
 *  `.spk` and the Docker image are versioned under (`0.1.39.3488516`). Not
 *  translated: it is read by whoever triages the issue. */
export function versionReport(client: VersionStamp, server: VersionStamp | null): string {
  return [
    `KROMA client ${describe(client)}`,
    `KROMA server ${server ? describe(server) : 'unknown'}`,
  ].join('\n');
}
