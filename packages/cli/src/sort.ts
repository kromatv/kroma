/** Compares by UTF-16 code unit: the ordering every machine agrees on, unlike
 *  `localeCompare`, which follows the build's locale. */
export function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
