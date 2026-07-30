import type { ClientBuild } from '@kroma/core';

// Which build of the TV client this is, and what server it needs. Vite replaces
// `__KROMA_BUILD__` with a literal; Metro has no `define` and the native shell
// calls `setBuildInfo` instead. An un-stamped build reads "dev".
declare const __KROMA_VERSION__: string | undefined;
declare const __KROMA_BUILD__: BuildInfo | undefined;

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

const MIN_SERVER_VERSION = '0.1.0';

// Read through `typeof`: under Metro the name is not declared at all and
// touching it would throw.
const DEFINED: BuildInfo | undefined =
  typeof __KROMA_BUILD__ === 'object' && __KROMA_BUILD__ ? __KROMA_BUILD__ : undefined;

const DEFINED_VERSION: string | undefined =
  typeof __KROMA_VERSION__ === 'string' && __KROMA_VERSION__ ? __KROMA_VERSION__ : undefined;

const UNKNOWN: BuildInfo = {
  version: DEFINED_VERSION ?? 'dev',
  commit: null,
  commitFull: null,
  branch: null,
  dirty: false,
  buildDate: null,
  repository: null,
};

let injected: BuildInfo | undefined;

/** For the bundler that has no `define`: the native shell must call this at
 * module scope, before the first render. */
export function setBuildInfo(info: Partial<BuildInfo> & { version?: string }): void {
  injected = { ...UNKNOWN, ...info };
}

export function buildInfo(): BuildInfo {
  return injected ?? DEFINED ?? UNKNOWN;
}

export const CLIENT_BUILD: ClientBuild = {
  get version() {
    return buildInfo().version;
  },
  minServerVersion: MIN_SERVER_VERSION,
};
