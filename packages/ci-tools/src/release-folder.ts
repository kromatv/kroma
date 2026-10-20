import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { root } from './root';

const RELEASES = join(root, 'releases');
const Meta = z.object({ draft: z.boolean().optional() }).loose();
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Whether `releases/<version>` holds notes a person wrote: notes present, and a
 * `release.json` that is absent or does not mark them a draft. An unreadable
 * `release.json` counts as written, so nothing a person touched is replaced.
 */
export function isHandWritten(version: string): boolean {
  const folder = join(RELEASES, version);
  if (!existsSync(join(folder, 'en.md'))) return false;
  const meta = join(folder, 'release.json');
  if (!existsSync(meta)) return true;
  try {
    return Meta.parse(JSON.parse(readFileSync(meta, 'utf8'))).draft !== true;
  } catch {
    return true;
  }
}

const key = (version: string) => (VERSION.exec(version)?.slice(1) ?? []).map(Number);

function compare(a: string, b: string): number {
  const [x, y] = [key(a), key(b)];
  for (let i = 0; i < 3; i++) {
    const delta = (x[i] ?? 0) - (y[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

/** The newest release folder a person wrote, or null. */
export function newestWritten(): string | null {
  if (!existsSync(RELEASES)) return null;
  return (
    readdirSync(RELEASES)
      .filter((v) => VERSION.test(v) && isHandWritten(v))
      .sort(compare)
      .at(-1) ?? null
  );
}
