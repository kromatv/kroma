import { CONFIG_PATH, type LinguaConfig, parseConfig, placeOf, rootOf } from '#site/core/config';
import type { FileRow, Project, Store } from '#site/store/store';
import type { Reader, Seen, TreeEntry } from './reader';

const FILES_PER_PASS = 40;

/** Who a sync reads GitHub through and where it keeps what it read. */
export interface Syncing {
  reader: Reader;
  store: Store;
}

/** How a pass left a project's copy: it held the branch head already, it holds it now, or files are left to read. */
export type SyncOutcome = 'unchanged' | 'moved' | 'behind';

async function configAt(reader: Reader, repo: string, at: { sha: string; tree: TreeEntry[] }) {
  const held = at.tree.some((e) => e.path === CONFIG_PATH && e.type === 'blob');
  if (!held) {
    return { config: null, text: null, error: `${CONFIG_PATH} is missing` };
  }
  const text = await reader.text(repo, at.sha, CONFIG_PATH);
  const parsed = parseConfig(text);
  return parsed.ok
    ? { config: parsed.config, text, error: null }
    : { config: null, text: null, error: parsed.error };
}

function projectEntries(config: LinguaConfig | null, tree: readonly TreeEntry[]) {
  const root = config ? rootOf(config) : null;
  return tree.flatMap((entry) => {
    const place = root !== null && entry.type === 'blob' ? placeOf(root, entry.path) : null;
    return place ? [{ ...place, path: entry.path, sha: entry.sha }] : [];
  });
}

async function readTree(reader: Reader, repo: string, sha: string) {
  const read = await reader.tree(repo, sha);
  if (read.truncated) {
    return {
      tree: read.sha,
      config: null,
      text: null,
      error: 'the repository tree is too large to read in one request',
      entries: [],
    };
  }
  const found = await configAt(reader, repo, { sha, tree: read.tree });
  return { ...found, tree: read.sha, entries: projectEntries(found.config, read.tree) };
}

async function storeBatch(
  { reader, store }: Syncing,
  at: { repo: string; seen: Seen },
  entries: ReturnType<typeof projectEntries>,
): Promise<{ changed: number; left: number }> {
  const held = await store.files(at.repo);
  const known = new Map(held.map((f) => [f.path, f.blobSha]));
  const changed = entries.filter((entry) => known.get(entry.path) !== entry.sha);
  const batch = changed.slice(0, Math.min(FILES_PER_PASS, reader.left));
  const upserts = await Promise.all(
    batch.map(async ({ sha, ...place }): Promise<FileRow> => {
      const body = await reader.text(at.repo, at.seen.sha, place.path);
      return { ...place, blobSha: sha, body };
    }),
  );
  const present = new Set(entries.map((e) => e.path));
  const removed = held.filter((f) => !present.has(f.path)).map((f) => f.path);
  await store.replaceFiles(at.repo, upserts, removed);
  return { changed: changed.length, left: changed.length - batch.length };
}

const progressAt = (project: Project, seen: Seen) =>
  project.branchSha === seen.sha ? project.progress : null;

async function keepHead(store: Store, project: Project, seen: Seen): Promise<void> {
  if (seen.sha !== project.branchSha || seen.etag !== project.etag) {
    await store.setBranchHead(project.id, { ...seen, progress: null });
  }
}

async function readToward(
  syncing: Syncing,
  at: { project: Project; seen: Seen; now: number },
): Promise<SyncOutcome> {
  const { reader, store } = syncing;
  const { project, seen } = at;
  if (reader.left < 3) {
    await store.setBranchHead(project.id, { ...seen, progress: progressAt(project, seen) });
    return 'behind';
  }
  const read = await readTree(reader, project.id, seen.sha);
  const { changed, left } = await storeBatch(syncing, { repo: project.id, seen }, read.entries);
  if (left > 0) {
    const total = progressAt(project, seen)?.total ?? changed;
    await store.setBranchHead(project.id, { ...seen, progress: { done: total - left, total } });
    return 'behind';
  }
  const { text: config, error: configError, tree: treeSha } = read;
  await store.setSynced(project.id, {
    headSha: seen.sha,
    treeSha,
    config,
    configError,
    at: at.now,
    etag: seen.etag,
  });
  return 'moved';
}

/**
 * One pass over a project: ask where its branch points (one conditional
 * request when it has not moved), then read at most forty of the files of its
 * i18n folder whose blob changed, as far as the reader's budget goes. The new
 * head is recorded only once every changed file is stored, so the next pass
 * carries on where this one stopped.
 */
export async function syncProject(
  syncing: Syncing,
  project: Project,
  now: number,
): Promise<SyncOutcome> {
  const since = project.branchSha === null ? null : { sha: project.branchSha, etag: project.etag };
  const seen = await syncing.reader.branchHead(project.id, project.branch, since);
  if (seen.sha !== project.headSha) {
    return readToward(syncing, { project, seen, now });
  }
  await keepHead(syncing.store, project, seen);
  return 'unchanged';
}
