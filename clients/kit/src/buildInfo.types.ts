// The shape both halves of the build-info split agree on.
//
// Its own file because the halves cannot import it from each other: the web
// bundler resolves `./buildInfo` to `buildInfo.web.ts`, so the web half asking
// its native sibling for the type would be asking itself.

/** A build made outside a git checkout still ships; each git-derived field is
 * nullable rather than the stamp being all-or-nothing. */
export interface BuildInfo {
  version: string;
  commit: string | null;
  branch: string | null;
  dirty: boolean;
  buildDate: string | null;
  repository: string | null;
}
