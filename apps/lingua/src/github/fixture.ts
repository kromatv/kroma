import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type CatalogSet, parseLock, renderLock, syncSet } from '@kromatv/i18n-tools';
import { placeOf } from '#site/core/config';
import { parsePolicy } from '#site/core/policy';
import type { FileRow } from '#site/store/store';

/** The folder a fixture project sits in, inside its repository. */
export const ROOT = 'loc';

const made: string[] = [];

/** A project's files under its folder: text, or a flat catalog written as i18n-tools writes it. */
export type FixtureFiles = Record<string, string | Record<string, string>>;

/** Write `content` under the project, as i18n-tools writes a catalog. */
export function write(set: CatalogSet, path: string, content: string | Record<string, string>) {
  const full = join(set.dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(
    full,
    typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
  );
}

/** A project on disk, its locks written by i18n-tools' `sync`, as the set i18n-tools works on. */
export function projectOnDisk(files: FixtureFiles): CatalogSet {
  const dir = mkdtempSync(join(tmpdir(), 'lingua-'));
  made.push(dir);
  const parsed = parsePolicy(
    typeof files['i18n.json'] === 'string' ? files['i18n.json'] : undefined,
  );
  const project = parsed.ok ? parsed.policy : { source: 'fr' };
  const set: CatalogSet = { name: 'core', dir, layout: 'folder', project };
  for (const [path, content] of Object.entries(files)) {
    write(set, path, content);
  }
  syncSet(set);
  return set;
}

/** Mark `keys` of `locale` as written by a machine in its lock on disk. */
export function markMachine(set: CatalogSet, locale: string, keys: readonly string[]) {
  const path = join(set.dir, locale, 'i18n.lock');
  const lock = parseLock(readFileSync(path, 'utf8'));
  for (const key of keys) {
    const entry = lock.get(key);
    if (entry) {
      lock.set(key, { ...entry, machine: true });
    }
  }
  writeFileSync(path, renderLock(lock));
}

/** Every file of the project on disk, as a sync leaves them in the store. */
export function rowsOf(set: CatalogSet): FileRow[] {
  return readdirSync(set.dir, { recursive: true, encoding: 'utf8' }).flatMap((entry) => {
    const path = `${ROOT}/${entry.split('\\').join('/')}`;
    const place = placeOf(ROOT, path);
    if (!place) {
      return [];
    }
    const body = readFileSync(join(set.dir, entry), 'utf8');
    return [
      {
        ...place,
        path,
        blobSha: createHash('sha256').update(body).digest('hex').slice(0, 40),
        body,
      },
    ];
  });
}

/** The files that differ between two readings of a project, as a commit would carry them. */
export function changed(before: readonly FileRow[], after: readonly FileRow[]) {
  const held = new Map(before.map((row) => [row.path, row.body]));
  return after
    .filter((row) => held.get(row.path) !== row.body)
    .map((row) => ({ path: row.path, content: row.body }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Remove every project written on disk. */
export function removeProjects(): void {
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
