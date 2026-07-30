// Every sort in these scripts feeds something that must be byte-identical on
// every machine: a generated roster, a catalog index, a validation report.
// `localeCompare`, the usual answer, is the wrong fix here: it orders by
// whatever locale the build happens to run under, so the same module set
// would come out in one order on a laptop and another in CI.

/** Compares by UTF-16 code unit - the machine-independent ordering. */
export function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
