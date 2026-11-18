import { basename } from 'node:path';

const VERSION = /\d{1,10}\.\d{1,10}\.\d{1,10}(?:[-.][0-9A-Za-z][0-9A-Za-z.]{0,63})?/;
const EXTENSION = /\.[A-Za-z][A-Za-z0-9]*$/;

function trimDots(found: string): string {
  let end = found.length;
  while (end > 0 && found[end - 1] === '.') {
    end--;
  }
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
  /** The most assets the release holds once an upload lands. GitHub refuses
   *  an upload past 1000, and two workflows publish at once. */
  capacity: number;
}

export const RETENTION: Retention = { keepDays: 14, keepMin: 5, capacity: 950 };

const newestFirst = (assets: readonly Asset[]) =>
  [...assets].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

function pastNewest(assets: readonly Asset[], keepMin: number): Asset[] {
  const families = new Map<string, Asset[]>();
  for (const asset of assets) {
    const key = familyOf(asset.name);
    families.set(key, [...(families.get(key) ?? []), asset]);
  }
  return [...families.values()].flatMap((family) => newestFirst(family).slice(keepMin));
}

/**
 * The assets a channel can let go of: within each family, everything past the
 * newest `keepMin` that is also older than `keepDays`. Age, not count: a live
 * catalog may still point at a build a newer one has not displaced yet.
 */
export function expired(
  assets: readonly Asset[],
  now: Date,
  retention: Omit<Retention, 'capacity'> = RETENTION,
): Asset[] {
  const cutoff = now.getTime() - retention.keepDays * 86_400_000;
  return pastNewest(assets, retention.keepMin).filter(
    (asset) => Date.parse(asset.createdAt) < cutoff,
  );
}

/**
 * What else has to go for `incoming` more assets to fit under `capacity`: the
 * oldest of what is past the newest `keepMin` of each family, oldest first. A
 * push rate that fills the release inside `keepDays` lands here.
 */
export function crowdedOut(
  assets: readonly Asset[],
  incoming: number,
  retention: Omit<Retention, 'keepDays'> = RETENTION,
): Asset[] {
  const over = assets.length + incoming - retention.capacity;
  if (over <= 0) {
    return [];
  }
  return newestFirst(pastNewest(assets, retention.keepMin)).reverse().slice(0, over);
}
