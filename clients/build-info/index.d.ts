// Types for index.js, which is CommonJS for the reasons its header gives. They
// exist for the Vite side: a `vite.config.ts` importing the collector is inside
// its client's `tsc --noEmit`, and an untyped require would fail it.

/** Which build this is. Every git-derived field is nullable: a build made
 * outside a checkout still ships, it just has less to say. */
export interface BuildInfo {
  /** This client's version (its package.json, or the product version). */
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
  buildDate: string;
  /** Browsable https URL of the origin remote. */
  repository: string | null;
}

export declare function browsableRemote(remote: string | null | undefined): string | null;

export declare function collectBuildInfo(
  projectRoot: string,
  overrides?: { version?: string | null },
): BuildInfo;

export declare function productVersion(repoRoot: string): string | null;
