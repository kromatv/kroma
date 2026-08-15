// Ordering for module versions. Modules release on their own tags now, so the
// pipeline has to answer "is this newer than what is published?" before it can
// decide to publish at all - and it must refuse a version that went backwards
// rather than quietly overwrite a release with older bytes.
//
// Deliberately narrow: `major.minor.patch` with an optional prerelease, which is
// what `modules validate` already accepts. Build metadata is ignored, per semver.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  // Empty for a release; `["nightly", 3]` for `-nightly.3`.
  prerelease: (string | number)[];
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** `null` when `raw` is not a version this pipeline will publish. */
export function parse(raw: string): Version | null {
  const m = SEMVER.exec(raw.trim());
  if (!m) return null;
  const [, major, minor, patch, pre] = m;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: pre ? pre.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [],
  };
}

function sign(a: string | number, b: string | number): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

// Numeric identifiers rank below alphanumeric ones, and compare numerically.
function comparePart(a: string | number, b: string | number): number {
  const aNum = typeof a === 'number';
  const bNum = typeof b === 'number';
  if (aNum && bNum) return sign(a, b);
  if (aNum !== bNum) return aNum ? -1 : 1;
  return sign(String(a), String(b));
}

function comparePrerelease(a: Version['prerelease'], b: Version['prerelease']): number {
  // A prerelease is LOWER than the release it leads to, so "has none" wins.
  if (a.length === 0 || b.length === 0) {
    if (a.length === b.length) return 0;
    return a.length === 0 ? 1 : -1;
  }
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i];
    const y = b[i];
    // A shorter prerelease chain is the lower one: 1.0.0-a < 1.0.0-a.1.
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = comparePart(x, y);
    if (c !== 0) return c;
  }
  return 0;
}

/** Negative / zero / positive, the `Array.sort` contract. */
function compare(a: Version, b: Version): number {
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

/** Compares two raw strings; unparseable ones sort below anything valid. */
export function compareRaw(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)];
  if (!x || !y) {
    if (x) return 1;
    if (y) return -1;
    return 0;
  }
  return compare(x, y);
}
