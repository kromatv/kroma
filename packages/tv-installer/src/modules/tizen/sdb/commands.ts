export const PACKAGE_TEMP_DIR = '/home/owner/share/tmp/sdk_tools';
export const PACKAGE_TEMP_DIR_QUERY = "/usr/bin/pkgcmd -a | head -1 | awk '{print $5}'";

const UNSAFE = /[^A-Za-z0-9._-]/g;
const SAFE_PATH = /^\/[A-Za-z0-9._/-]*$/;

/** A basename the device's shell takes verbatim: everything else becomes `_`. */
export function remoteName(fileName: string): string {
  const cleaned = fileName.replace(UNSAFE, '_').replace(/^[._]+/, '');
  return cleaned || 'package.wgt';
}

export function remotePath(directory: string, fileName: string): string {
  const base = directory.endsWith('/') ? directory.slice(0, -1) : directory;
  const path = `${base}/${remoteName(fileName)}`;
  if (!SAFE_PATH.test(path)) throw new Error(`sdb: refusing an unquotable remote path "${path}"`);
  return path;
}

/**
 * Every shape a set might install by, most specific first. Samsung's television
 * sdbd answers `vd_appinstall`; a generic Tizen sdbd answers `appinstall` when
 * it advertises the secure protocol, and `pkgcmd` is what stock sdb falls back
 * to for a `.wgt`.
 */
export function installCommands(packageId: string, path: string, type = 'wgt'): string[] {
  return [
    `0 vd_appinstall ${packageId} ${path}`,
    `0 appinstall ${type} ${path}`,
    `/usr/bin/pkgcmd -i -t ${type} -p "${path}" -q`,
  ];
}

export function uninstallCommands(packageId: string): string[] {
  return [
    `0 vd_appuninstall ${packageId}`,
    `0 appuninstall ${packageId}`,
    `/usr/bin/pkgcmd -u -n ${packageId} -q`,
  ];
}

export function launchCommands(appId: string): string[] {
  return [`0 was_execute ${appId}`, `0 execute ${appId}`, `/usr/bin/app_launcher -s ${appId}`];
}

export function removeCommands(path: string): string[] {
  return [`0 rmfile "${path}"`, `/bin/rm -f "${path}"`];
}

/** `KromaTV001.KROMA` is an application id; the package it belongs to is `KromaTV001`. */
export function packageIdOf(appId: string): string {
  return appId.split('.')[0] ?? appId;
}
