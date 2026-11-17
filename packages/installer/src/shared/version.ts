const parts = (version: string): number[] =>
  version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);

/** Whether a dotted version such as `20.10.0` or `5.5` comes before `floor`. A missing part counts as 0. */
export function olderThan(version: string, floor: string): boolean {
  const have = parts(version);
  const need = parts(floor);
  for (let index = 0; index < Math.max(have.length, need.length); index++) {
    const a = have[index] ?? 0;
    const b = need[index] ?? 0;
    if (a !== b) {
      return a < b;
    }
  }
  return false;
}
