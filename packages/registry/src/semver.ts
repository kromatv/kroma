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

type Operator = '^' | '~' | '>=' | '=';

function operatorOf(range: string): Operator {
  if (range.startsWith('^')) return '^';
  if (range.startsWith('~')) return '~';
  if (range.startsWith('>=')) return '>=';
  return '=';
}

const stable = (major: number, minor: number, patch: number): Version => ({
  major,
  minor,
  patch,
  prerelease: [],
});

// Caret is compatible within the left-most non-zero segment; tilde within the minor.
function upperBound(operator: '^' | '~', base: Version): Version {
  if (operator === '~') return stable(base.major, base.minor + 1, 0);
  if (base.major > 0) return stable(base.major + 1, 0, 0);
  if (base.minor > 0) return stable(0, base.minor + 1, 0);
  return stable(0, 0, base.patch + 1);
}

const sameTuple = (a: Version, b: Version) =>
  a.major === b.major && a.minor === b.minor && a.patch === b.patch;

/**
 * Whether `version` is inside `range`, for the operators the manifests use
 * (exact, `^`, `~`, `>=`, `*`). Pre-releases stay opt-in exactly as npm has
 * them: `^0.1.0` never matches `0.2.0-beta.1`, and a pre-release only satisfies
 * a range whose own comparator is a pre-release of the same `x.y.z`. An
 * unparseable version or comparator satisfies nothing.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  if (!v) return false;
  const r = range.trim();
  if (r === '' || r === '*' || r === 'latest') return v.prerelease.length === 0;

  const operator = operatorOf(r);
  const base = parse(operator === '=' ? r : r.slice(operator.length));
  if (!base) return false;
  if (v.prerelease.length > 0 && (base.prerelease.length === 0 || !sameTuple(v, base))) {
    return false;
  }
  if (operator === '=') return compare(v, base) === 0;
  if (operator === '>=') return compare(v, base) >= 0;
  return compare(v, base) >= 0 && compare(v, upperBound(operator, base)) < 0;
}

/**
 * The named channel a version belongs to: `latest` for a stable release, its
 * first pre-release identifier (`beta`, `rc`, `nightly`…) otherwise, and `null`
 * for a pre-release that names none (`1.0.0-1`) or a version that is not semver.
 */
export function channelOf(version: string): string | null {
  const parsed = parse(version);
  if (!parsed) return null;
  const [first] = parsed.prerelease;
  if (first === undefined) return 'latest';
  return typeof first === 'string' ? first : null;
}
