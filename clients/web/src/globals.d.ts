/** Build metadata, resolved at build time by the `virtual:build-info` Vite plugin
 * (see vite.config.ts). A "fake" module with no on-disk file. */
declare module 'virtual:build-info' {
  export interface BuildInfo {
    /** Web client version (from package.json). */
    version: string;
    /** Short commit hash, or 'unknown' when built outside a git checkout. */
    commit: string;
    /** Full commit hash. */
    commitFull: string;
    /** Git branch at build time. */
    branch: string;
    /** Whether the working tree had uncommitted changes at build time. */
    dirty: boolean;
    /** ISO timestamp of the build (or dev-server start). */
    buildDate: string;
    /** Browsable https URL of the origin remote, or null. */
    repository: string | null;
  }
  const buildInfo: BuildInfo;
  export default buildInfo;
  export const version: string;
  export const commit: string;
  export const commitFull: string;
  export const branch: string;
  export const dirty: boolean;
  export const buildDate: string;
  export const repository: string | null;
}
