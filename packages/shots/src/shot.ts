import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/** One screen, as every target is asked for it. Each target uses the field its
 * own routing understands and ignores the rest. */
export interface Screen {
  /** Web client: the URL path. */
  path: string;
  /** TV shells: a `RouteName` from packages/tv/src/app/router.tsx. */
  route: string;
  /** Params for that route, for the ones that take them (`grid`, `genre`, …). */
  params?: unknown;
  /** Remote keys pressed before the capture, on the targets that take them. */
  keys: string[];
  /** Extra settle time before the shutter, for a screen that animates in. */
  settleMs: number;
}

export interface Shot {
  targetId: string;
  label: string;
  file: string;
}

/** Where a run writes, refusing anywhere outside the repo: the slug reaches
 * this from the command line, and the next thing that happens to it is an
 * `mkdirSync`. */
export function outDirFor(repo: string, slug: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`slug must be kebab-case ([a-z0-9-]), got "${slug}"`);
  }
  const root = resolve(repo, '.shots');
  const dir = resolve(root, slug);
  if (!dir.startsWith(`${root}${sep}`)) {
    throw new Error(`refusing to write outside ${root}: ${slug}`);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The published asset name. Flat, because a GitHub release is a flat bucket
 * and two runs of different slugs must not collide. */
export function assetName(slug: string, targetId: string): string {
  return `${slug}-${targetId}.png`;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** A capture tool that reports success on an empty file publishes a broken
 * image into a pull request, which is worse than failing. Every target is held
 * to this before its shot is counted. */
export function assertPng(file: string, targetId: string): void {
  const bytes = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
  if (bytes.length && bytes.subarray(0, 4).equals(PNG_MAGIC)) return;
  throw new Error(
    `${targetId}: the capture produced ${bytes.length ? 'something that is not a PNG' : 'an empty file'}. ` +
      `Nothing was written that could be published.`,
  );
}
