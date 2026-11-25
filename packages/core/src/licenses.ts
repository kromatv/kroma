import type { LicenseEntry, Licenses } from '@kromatv/client/licenses';

/** The part of KROMA a licenses manifest was built for. */
export type LicenseSurface = 'server' | 'web';

/** One build's `third-party-licenses.json`, and what it was built for. */
export interface SurfaceLicenses {
  surface: LicenseSurface;
  licenses: Licenses;
}

/** A third-party package as the licenses page lists it: once, with every
 * build that ships it and the texts of its notice. */
export interface ShippedPackage {
  key: string;
  kind: LicenseEntry['kind'];
  name: string;
  version: string | null;
  license: string | null;
  source: string | null;
  texts: string[];
  surfaces: LicenseSurface[];
}

const WEB_ADDRESS = /^https?:\/\//i;

function packageOf(entry: LicenseEntry, build: SurfaceLicenses, key: string): ShippedPackage {
  return {
    key,
    kind: entry.kind,
    name: entry.name,
    version: entry.version,
    license: entry.license,
    source: entry.source !== null && WEB_ADDRESS.test(entry.source) ? entry.source : null,
    texts: entry.texts.flatMap((index) => build.licenses.texts[index] ?? []),
    surfaces: [build.surface],
  };
}

function byName(a: ShippedPackage, b: ShippedPackage): number {
  return a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind);
}

/** Every package the builds ship, once per kind, name and version, in name
 * order. A source that is not a web address is dropped rather than linked. */
export function shippedPackages(builds: readonly SurfaceLicenses[]): ShippedPackage[] {
  const known = new Map<string, ShippedPackage>();
  for (const build of builds) {
    for (const entry of build.licenses.entries) {
      const key = `${entry.kind}:${entry.name}@${entry.version ?? ''}`;
      const seen = known.get(key);
      if (seen === undefined) {
        known.set(key, packageOf(entry, build, key));
      } else if (!seen.surfaces.includes(build.surface)) {
        seen.surfaces.push(build.surface);
      }
    }
  }
  return [...known.values()].sort(byName);
}

/** The packages whose name, version or license holds `query`, ignoring case.
 * A blank query matches every one. */
export function matchingPackages(
  packages: readonly ShippedPackage[],
  query: string,
): readonly ShippedPackage[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return packages;
  }
  return packages.filter((one) =>
    [one.name, one.version ?? '', one.license ?? ''].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}
