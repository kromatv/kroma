const OS = new Map([
  ['linux', 'Linux'],
  ['darwin', 'macOS'],
  ['windows', 'Windows'],
  ['freebsd', 'FreeBSD'],
  ['android', 'Android'],
]);

const LIBC = new Map([
  ['musl', 'musl'],
  ['gnu', 'glibc'],
]);

/** A platform key from the collector as a reader knows it: `linux-musl` is
 * `Linux (musl)`, `darwin` is `macOS`. Anything it cannot place comes back as
 * it came. */
export function targetName(key: string): string {
  const [os, env] = key.split('-');
  const name = os === undefined ? undefined : OS.get(os);
  if (!name) return key;
  const libc = env === undefined ? undefined : LIBC.get(env);
  return libc ? `${name} (${libc})` : name;
}
