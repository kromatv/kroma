/** Every git-derived field is null when the build was made outside a checkout. */
export interface BuildInfo {
  version: string;
  commit: string | null;
  commitFull: string | null;
  branch: string | null;
  dirty: boolean;
  buildDate: string | null;
  repository: string | null;
}

const UNKNOWN: BuildInfo = {
  version: 'dev',
  commit: null,
  commitFull: null,
  branch: null,
  dirty: false,
  buildDate: null,
  repository: null,
};

/** Resolve one immutable build stamp without changing another shell. */
export function resolveBuildInfo(info: Partial<BuildInfo> = {}): Readonly<BuildInfo> {
  return Object.freeze({ ...UNKNOWN, ...info });
}
export function clientBuildFor(info: BuildInfo) {
  return Object.freeze({ version: info.version, minServerVersion: '0.1.0' });
}
