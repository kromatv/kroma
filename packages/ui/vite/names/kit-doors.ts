import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { type DoorIo, type DoorWalk, walkDoors } from './door-walk.ts';

const PLATFORM = /^(?:\.(?:web|native|ios|android))?\.tsx?$/;

const SOURCE = /\.tsx?$/;

/** The kit's doors: the `.` and `./kit` entries of `@kromatv/ui`. */
export const DOORS = ['index.ts', 'kit.ts'];

function baseOf(specifier: string, from: string, srcRoot: string): string | null {
  if (specifier.startsWith('.')) {
    return resolve(dirname(from), specifier);
  }
  return specifier.startsWith('#ui/') ? join(srcRoot, specifier.slice('#ui/'.length)) : null;
}

function filesIn(dir: string, listings: Map<string, string[]>): string[] {
  const known = listings.get(dir);
  if (known) {
    return known;
  }
  let files: string[] = [];
  try {
    files = readdirSync(dir);
  } catch {
    files = [];
  }
  listings.set(dir, files);
  return files;
}

function variantsOf(stem: string, listings: Map<string, string[]>): string[] {
  const name = basename(stem);
  return filesIn(dirname(stem), listings)
    .filter((file) =>
      file === name
        ? SOURCE.test(file)
        : file.startsWith(name) && PLATFORM.test(file.slice(name.length)),
    )
    .map((file) => join(dirname(stem), file));
}

/** Reads the kit from disk: a relative or `#ui/` specifier resolves to the
 *  file or the folder index it names, in every platform variant present. */
export function kitIo(srcRoot: string): DoorIo {
  const listings = new Map<string, string[]>();
  return {
    read: (file) => readFileSync(file, 'utf8'),
    resolve(specifier, from) {
      const base = baseOf(specifier, from, srcRoot);
      return base === null
        ? []
        : [...variantsOf(base, listings), ...variantsOf(join(base, 'index'), listings)];
    },
  };
}

/** The names the kit's doors give, read from the sources under `repoRoot`. */
export function walkKit(repoRoot: string): DoorWalk {
  const srcRoot = join(repoRoot, 'packages', 'ui', 'src');
  return walkDoors(
    DOORS.map((door) => join(srcRoot, door)),
    kitIo(srcRoot),
  );
}

/** A digest of the names alone, so a cache keyed on it moves only when they do. */
export function namesHash({ names }: DoorWalk): string {
  const entries = [...names].sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}
