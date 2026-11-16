import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type CatalogSet, parseLock, renderLock, syncSet } from '@kromatv/i18n-tools';
import { placeOf } from '#site/core/config';
import { parsePolicy } from '#site/core/policy';
import { memoryStore } from '#site/store/memory-store';
import type { FileRow, Store, User } from '#site/store/store';
import type { Forking } from './fork';
import { type Outcome, propose } from './propose';
import { sha } from './test-support';

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
    const path = `${ROOT}/${entry.replaceAll('\\', '/')}`;
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

/** The contributor every proposal test sends as. */
export const ada: User = { id: 42, login: 'Ada', name: 'Ada L.', avatarUrl: null };

/** What a contributor holds for one language, English unless `locale` says otherwise. */
export interface HeldWork {
  locale?: string;
  edits?: Record<string, string>;
  confirms?: string[];
  start?: boolean;
}

/** A store holding project `o/r`, synced at `sha('a')` with `rows`, and `ada`'s work. */
export async function storeHolding(rows: readonly FileRow[], work: HeldWork): Promise<Store> {
  const store = memoryStore();
  const mine = { project: 'o/r', userId: ada.id, locale: work.locale ?? 'en', proposed: false };
  await store.upsertProject({ id: 'o/r', branch: 'main', pinned: false });
  await store.setSynced('o/r', {
    headSha: sha('a'),
    treeSha: sha('0e'),
    config: JSON.stringify({ projects: [{ path: ROOT }] }),
    configError: null,
    at: 1,
  });
  await store.replaceFiles('o/r', rows, []);
  await Promise.all([
    ...Object.entries(work.edits ?? {}).map(([key, value]) =>
      store.putEdit({ ...mine, file: key.split('.')[0] ?? '', key, value, updatedAt: 1 }),
    ),
    ...(work.confirms ?? []).map((key) => store.putConfirm({ ...mine, key, updatedAt: 1 })),
    ...(work.start ? [store.putStart({ ...mine, createdAt: 1 })] : []),
  ]);
  return store;
}

/** Send `ada`'s work for `locale` through her fork, from the project the store holds. */
export async function sendAs(forking: Forking, store: Store, locale = 'en'): Promise<Outcome> {
  const project = await store.project('o/r');
  if (!project) {
    throw new Error('the project was not seeded');
  }
  const files = await store.files('o/r');
  return propose(forking, store, {
    project,
    root: ROOT,
    files,
    user: ada,
    locale,
    origin: 'https://lingua.test',
    now: 1_800_000_000,
  });
}
