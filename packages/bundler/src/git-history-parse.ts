// Turning git's own output into a component's history: the parsing, the rename
// following and the grouping, with no process to spawn. `git-history-read.ts`
// runs git; everything below is pure, so it is read and tested without a
// repository.

/** One commit, as the workbench lists it. */
export interface HistoryCommit {
  sha: string;
  date: string;
  subject: string;
}

/** What one component folder or one page file has been through. The dates are
 * absent for something that exists but has never been committed, which is a
 * state of its own and not the same as knowing nothing about it. Mirrors
 * `HistoryEntry` in @kroma/workbench; kept structural rather than imported so
 * this build-time module has no runtime dependency on the package. */
export interface HistoryEntry {
  created?: string;
  changed?: string;
  dirty: boolean;
  commits: HistoryCommit[];
}

/** Every entry the build could read, keyed by repository-relative path: a
 * component by its `*.story.mdx`, an article by its own `.page.mdx`. `shallow`
 * says the clone was truncated, in which case there are no entries at all -
 * a creation date read from half a history is a wrong one. */
export interface GitHistory {
  entries: Record<string, HistoryEntry>;
  shallow: boolean;
}

interface LogChange {
  status: string;
  path: string;
  from?: string;
}

/** One commit of `git log --name-status -z`, with the paths it touched. */
export interface LogCommit {
  sha: string;
  date: string;
  subject: string;
  changes: LogChange[];
}

/** What the working tree adds to what HEAD says: which paths carry edits that
 * are not committed, and which ones the index has already renamed - the second
 * is what keeps a moved component's history attached to it before the move is
 * committed. */
interface WorkingTree {
  renamedFrom: Map<string, string>;
  dirty: Set<string>;
  untracked: string[];
}

// Starts a commit's header in the log format below; `\x1f` separates its fields.
// Both are bytes git never writes in a path, a subject or a date.
const COMMIT_MARK = '\x01';
const FIELD_MARK = '\x1f';

const STORY = '.story.mdx';
const PAGE = '.page.mdx';

/** The fields `readGitHistory` asks `git log` for, in the order `parseLog`
 * reads them back. */
export const LOG_FORMAT = `--format=${COMMIT_MARK}%h${FIELD_MARK}%aI${FIELD_MARK}%s`;

// `-z` separates records with NUL, and the header that precedes a commit's
// first status record leaves the format's own newline on its front.
const token = (raw: string | undefined): string => raw?.replace(/^\n+/, '') ?? '';

/** The paths in a NUL-separated list (`git ls-files -z`). */
export function splitPaths(output: string): string[] {
  return output.split('\0').filter(Boolean);
}

/** Reads `git status --porcelain -z`. A rename carries its original name as the
 * record after it, which is where a staged move's earlier life is found. */
export function parseStatus(output: string): WorkingTree {
  const renamedFrom = new Map<string, string>();
  const dirty = new Set<string>();
  const untracked: string[] = [];
  const records = output.split('\0');
  for (let at = 0; at < records.length; at += 1) {
    const record = records[at];
    if (!record) continue;
    const code = record.slice(0, 2);
    const path = record.slice(3);
    if (!path) continue;
    dirty.add(path);
    if (code === '??') untracked.push(path);
    if (code.includes('R') || code.includes('C')) {
      at += 1;
      const from = records[at];
      if (from) renamedFrom.set(path, from);
    }
  }
  return { renamedFrom, dirty, untracked };
}

/** Reads `git log --name-status -z` written with `LOG_FORMAT`, newest commit
 * first. */
export function parseLog(output: string): LogCommit[] {
  const commits: LogCommit[] = [];
  const records = output.split('\0');
  let current: LogCommit | undefined;
  for (let at = 0; at < records.length; at += 1) {
    const record = token(records[at]);
    if (!record) continue;
    if (record.startsWith(COMMIT_MARK)) {
      const [sha, date, ...subject] = record.slice(1).split(FIELD_MARK);
      current = {
        sha: sha as string,
        date: date ?? '',
        subject: subject.join(FIELD_MARK),
        changes: [],
      };
      commits.push(current);
      continue;
    }
    if (!current) continue;
    // A rename carries two paths, the name it had and the name it took.
    let from: string | undefined;
    if (record.startsWith('R') || record.startsWith('C')) {
      at += 1;
      from = token(records[at]);
    }
    at += 1;
    const path = token(records[at]);
    if (path) current.changes.push({ status: record, path, ...(from ? { from } : null) });
  }
  return commits;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const held = map.get(key);
  if (held) held.push(value);
  else map.set(key, [value]);
}

/**
 * Every commit that touched each of `targets`, oldest last, following renames.
 *
 * One pass over the whole log rather than a `git log --follow` per file, which
 * that option cannot do anyway: it takes a single path. A file is tracked under
 * the name it had at the commit being read, so a rename moves the tracking onto
 * the old name and the walk carries on into the file's earlier life.
 *
 * `targets` maps a path as it is NOW to the name HEAD knows it by, which are two
 * different things while a move sits staged in the index.
 */
function tracking(targets: ReadonlyMap<string, string>): Map<string, Set<string>> {
  const live = new Map<string, Set<string>>();
  for (const [now, head] of targets) {
    const held = live.get(head);
    if (held) held.add(now);
    else live.set(head, new Set([now]));
  }
  return live;
}

// Move every holder of this path onto the name the file had before the rename,
// joining whoever is already tracking that name.
function follow(live: Map<string, Set<string>>, from: string, path: string, holders: Set<string>) {
  live.delete(path);
  const earlier = live.get(from);
  if (earlier) for (const holder of holders) earlier.add(holder);
  else live.set(from, holders);
}

export function attribute(
  commits: readonly LogCommit[],
  targets: ReadonlyMap<string, string>,
): Map<string, HistoryCommit[]> {
  const live = tracking(targets);
  const found = new Map<string, HistoryCommit[]>();
  for (const commit of commits) {
    for (const change of commit.changes) {
      const holders = live.get(change.path);
      if (!holders) continue;
      for (const holder of holders) {
        push(found, holder, { sha: commit.sha, date: commit.date, subject: commit.subject });
      }
      if (change.from) follow(live, change.from, change.path, holders);
    }
  }
  return found;
}

const folderOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const stemOf = (story: string): string => nameOf(story).slice(0, -STORY.length);

// Which story a file belongs to: the nearest one at or above it, since a
// component's own folder is the deepest thing holding a story. A folder with
// several stories in it - the foundations - splits by file name instead, so
// `colors.test.ts` counts towards <Colors> and not towards its four neighbours.
function storyFor(file: string, byFolder: ReadonlyMap<string, string[]>): string | null {
  for (let folder = folderOf(file); folder; folder = folderOf(folder)) {
    const stories = byFolder.get(folder);
    if (!stories?.length) continue;
    if (stories.length === 1) return stories[0] as string;
    const name = nameOf(file);
    return stories.find((story) => name.startsWith(`${stemOf(story)}.`)) ?? null;
  }
  return null;
}

/**
 * The files behind each thing the workbench shows, keyed the way it looks one
 * up: a component by the path of its story, an article by its own file.
 *
 * A component is its whole folder - code, stories, demos and tests - because
 * that is the unit the source link already opens and the unit a reader means by
 * "when did this change".
 */
export function groupFiles(files: readonly string[]): Map<string, string[]> {
  const byFolder = new Map<string, string[]>();
  for (const file of files) if (file.endsWith(STORY)) push(byFolder, folderOf(file), file);
  const groups = new Map<string, string[]>();
  for (const file of files) {
    if (file.endsWith(PAGE)) {
      push(groups, file, file);
      continue;
    }
    const story = storyFor(file, byFolder);
    if (story) push(groups, story, file);
  }
  return groups;
}

const newestFirst = (a: HistoryCommit, b: HistoryCommit): number =>
  Date.parse(b.date) - Date.parse(a.date);

/** One entry per group, dropping any git has nothing at all to say about.
 * Something committed carries its two dates; something that only exists in the
 * working tree carries none, because it has no history yet rather than an
 * unknown one. `kept` bounds the listed commits; the dates are read from the
 * whole history regardless. */
export function entriesOf(
  groups: ReadonlyMap<string, string[]>,
  commits: ReadonlyMap<string, HistoryCommit[]>,
  dirty: ReadonlySet<string>,
  kept: number,
): Record<string, HistoryEntry> {
  const entries: Record<string, HistoryEntry> = {};
  for (const [key, files] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const seen = new Map<string, HistoryCommit>();
    for (const file of files) {
      for (const commit of commits.get(file) ?? []) seen.set(commit.sha, commit);
    }
    const found = [...seen.values()].sort(newestFirst);
    const changed = found[0];
    const created = found.at(-1);
    const edited = files.some((file) => dirty.has(file));
    if (!(changed && created)) {
      if (edited) entries[key] = { dirty: true, commits: [] };
      continue;
    }
    entries[key] = {
      created: created.date,
      changed: changed.date,
      dirty: edited,
      commits: found.slice(0, kept),
    };
  }
  return entries;
}
