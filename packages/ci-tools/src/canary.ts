import { basename } from 'node:path';

const VERSION = /\d{1,10}\.\d{1,10}\.\d{1,10}(?:[-.][0-9A-Za-z][0-9A-Za-z.]{0,63})?/;
const EXTENSION = /\.[A-Za-z][A-Za-z0-9]*$/;

function trimDots(found: string): string {
  let end = found.length;
  while (end > 0 && found[end - 1] === '.') end--;
  return found.slice(0, end);
}

/** The version a file name carries, or null for a name that carries none. */
export function versionOf(name: string): string | null {
  const found = VERSION.exec(name.replace(EXTENSION, ''))?.[0];
  return found === undefined ? null : trimDots(found);
}

/**
 * The name a candidate's file takes on the canary channel: its bare version
 * replaced by the dated one, so two pushes of the same version stay two
 * files. A name carrying no version, or one that is not the candidate's, is
 * left alone.
 */
export function canaryName(file: string, triplet: string, canary: string): string {
  const name = basename(file);
  return versionOf(name) === triplet ? name.replace(triplet, canary) : name;
}

/** The name with its version blanked: what makes two uploads the same file over time. */
export const familyOf = (name: string) => {
  const version = versionOf(name);
  return version === null ? name : name.replace(version, '*');
};

export interface Asset {
  name: string;
  createdAt: string;
}

interface Retention {
  /** Days an asset is kept no matter what. */
  keepDays: number;
  /** Newest assets of a family that are kept no matter how old. */
  keepMin: number;
}

export const RETENTION: Retention = { keepDays: 14, keepMin: 5 };

/**
 * The assets a channel can let go of: within each family, everything past the
 * newest `keepMin` that is also older than `keepDays`. Age, not count: a live
 * catalog may still point at a build a newer one has not displaced yet.
 */
export function expired(assets: readonly Asset[], now: Date, retention = RETENTION): Asset[] {
  const cutoff = now.getTime() - retention.keepDays * 86_400_000;
  const families = new Map<string, Asset[]>();
  for (const asset of assets) {
    const key = familyOf(asset.name);
    families.set(key, [...(families.get(key) ?? []), asset]);
  }
  const out: Asset[] = [];
  for (const family of families.values()) {
    const byAge = [...family].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    for (const asset of byAge.slice(retention.keepMin)) {
      if (Date.parse(asset.createdAt) < cutoff) out.push(asset);
    }
  }
  return out;
}
