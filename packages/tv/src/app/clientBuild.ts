import type { ClientBuild } from '@kroma/core';

// Which build of the TV client this is, and what server it needs.
//
// The identity is baked in at BUILD time, because nothing at runtime can know
// it, and the two bundlers that produce this app take different roads to say the
// same thing:
//
//   Vite (Tizen, webOS, Android TV, desktop)  a `define` replaces
//        `__KROMA_BUILD__` with the literal object. See clients/tv-build/shell.ts.
//   Metro (the native Apple TV / Android TV app)  has no `define`, so the SHELL
//        pushes it in through `setBuildInfo` before the first render, the same
//        way it registers the voice-search and image backends. See
//        clients/tv-native/src/App.tsx.
//
// An un-stamped dev build reads "dev", which the compat check treats as
// always-compatible, and shows no commit rather than a wrong one.
declare const __KROMA_VERSION__: string | undefined;
declare const __KROMA_BUILD__: BuildInfo | undefined;

/** Which build this is. Every git-derived field is nullable: a build made
 * outside a checkout still ships, it just has less to say, and the About screen
 * drops the rows it cannot fill. */
export interface BuildInfo {
  /** The version this client reports (the product's - see `productVersion`). */
  version: string;
  /** Short commit hash, or null when built outside a git checkout. */
  commit: string | null;
  /** Full commit hash. */
  commitFull: string | null;
  /** Git branch at build time. */
  branch: string | null;
  /** Whether the working tree had uncommitted changes when this was built. */
  dirty: boolean;
  /** ISO timestamp of the build (or of the dev-server start). */
  buildDate: string | null;
  /** Browsable https URL of the origin remote. */
  repository: string | null;
}

/** The oldest SERVER version this build is compatible with. Bump this when
 * the client starts relying on a server API that older servers don't have; until
 * then every server (>= 0.1.0) is fine and no warning fires. */
const MIN_SERVER_VERSION = '0.1.0';

/** What the `define` left behind, if there was one. Read through `typeof` because
 * under Metro the name is not declared at all and touching it would throw. */
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

/**
 * Tell the app which build it is. For the bundler that has no `define`: the
 * native shell reads Expo's `Constants.expoConfig.extra.buildInfo` and calls
 * this at module scope, before the first render.
 */
export function setBuildInfo(info: Partial<BuildInfo> & { version?: string }): void {
  injected = { ...UNKNOWN, ...info };
}

/** This build's identity. Whichever road it arrived by. */
export function buildInfo(): BuildInfo {
  return injected ?? DEFINED ?? UNKNOWN;
}

/** This client build's version + its server requirement, for the compatibility
 * check (see @kroma/core `checkServerCompat`). */
export const CLIENT_BUILD: ClientBuild = {
  get version() {
    return buildInfo().version;
  },
  minServerVersion: MIN_SERVER_VERSION,
};
