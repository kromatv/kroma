// Its own file because the halves cannot import it from each other: the web
// bundler resolves `./buildInfo` to `buildInfo.web.ts`.

/** The shape both halves of the build-info split agree on. */
export interface BuildInfo {
  version: string;
  commit: string | null;
  commitFull: string | null;
  branch: string | null;
  dirty: boolean;
  buildDate: string | null;
  repository: string | null;
}
