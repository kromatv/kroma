/** The header every request names its app in, as `<shell>/<version>`. */
export const APP_VERSION_HEADER = 'X-Kroma-Client';

/** Which app this build is: the shell it ships as (`web`, `tizen`, `webos`,
 * `ios`, `android`, `tvos`, `androidtv`, `desktop`) and its product version. */
export interface AppIdentity {
  shell: string;
  version: string;
}

const shellOf = (s: string): string =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-')
    .slice(0, 32);

const versionOf = (s: string): string => s.replace(/[^0-9A-Za-z.+-]/g, '').slice(0, 64);

/** `<shell>/<version>` as the server reads it, or `undefined` when the build
 * cannot name itself, in which case the header is left off. */
export function appVersionHeader({ shell, version }: AppIdentity): string | undefined {
  const name = shellOf(shell);
  const build = versionOf(version);
  return name && build ? `${name}/${build}` : undefined;
}
