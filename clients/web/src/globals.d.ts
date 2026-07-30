/** Virtual module with no on-disk file, resolved by a Vite plugin (vite.config.ts). */
declare module 'virtual:build-info' {
  export interface BuildInfo {
    version: string;
    commit: string;
    commitFull: string;
    branch: string;
    dirty: boolean;
    buildDate: string;
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
