// The shape both halves of the build-info split agree on.
//
// Its own file because the halves cannot import it from each other: the web
// bundler resolves `./buildInfo` to `buildInfo.web.ts`, so the web half asking
// its native sibling for the type would be asking itself.

/** Which build this is. Every git-derived field is nullable: a build made
 * outside a checkout still ships, it just has less to say, and the stamp under
 * the story tree drops what it cannot fill. */
export interface BuildInfo {
  /** The kit's own version, from its package.json. */
  version: string;
  /** Short commit hash, or null when built outside a git checkout. */
  commit: string | null;
  /** Git branch at build time. */
  branch: string | null;
  /** Whether the working tree had uncommitted changes when this was built. */
  dirty: boolean;
  /** ISO timestamp of the build (or of the dev-server start). */
  buildDate: string | null;
  /** Browsable https URL of the origin remote. */
  repository: string | null;
}
