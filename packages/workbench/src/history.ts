// What git says about a component or an article, as the workbench reads it.
//
// There is no git here: this is the data `@kroma/bundler`'s `gitHistory` plugin
// extracted at build time, plus the rules for turning it into something a reader
// can act on. Empty on Metro, which has no build-time reader - the same shape as
// the prop docs.

import { permalink } from './link';
import { repoPath } from './repo-path';

/** One commit, as a panel lists it. */
interface HistoryCommit {
  sha: string;
  date: string;
  subject: string;
}

/** What one component or article has been through. The dates are absent for
 * something that exists but has never been committed, which is a state of its
 * own rather than a gap. */
interface HistoryEntry {
  created?: string;
  changed?: string;
  dirty: boolean;
  commits: readonly HistoryCommit[];
}

/** Every entry a build could read, keyed by repository-relative path: a
 * component by its `*.stories.tsx`, an article by its own `.page.mdx`.
 * `shallow` says the clone was truncated, which is why there is nothing here. */
interface KitHistory {
  entries: Readonly<Record<string, HistoryEntry>>;
  shallow: boolean;
}

/** What the history is about, wherever a list of them is shown. */
interface HistorySubject {
  id: string;
  name: string;
  group: string;
  page: boolean;
  path?: string;
}

interface HistoryRow extends HistorySubject {
  entry: HistoryEntry;
}

/** A subject's entry, looked up by the file the bundler discovered it at. */
function historyOf(
  history: KitHistory | undefined,
  root: string,
  path: string | undefined,
): HistoryEntry | undefined {
  if (!(history && path)) return undefined;
  return history.entries[repoPath(root, path)];
}

/** The permalink to one commit. Null unless the build names a remote, so a
 * workbench built outside a checkout lists its commits without linking them. */
function commitUrl(repository: string | null, sha: string): string | null {
  return permalink(repository, 'commit', sha);
}

/** The permalink to a single FILE, pinned to the revision this build was made
 * from - what an article is, where a component is a folder. */
function fileUrl(
  repository: string | null,
  commit: string | null,
  root: string,
  path: string | undefined,
): string | null {
  return path ? permalink(repository, 'blob', commit, repoPath(root, path)) : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date as `11 Aug 2026`. Written out rather than localised: every host would
 * otherwise word the same build differently. */
function dayLabel(iso: string | undefined): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
}

const DAY = 86_400_000;

const daysSince = (iso: string, now: number): number =>
  Math.floor((now - new Date(iso).getTime()) / DAY);

/** How long ago, in the words a reader actually uses. Falls back to the date
 * itself past a month, where "six weeks ago" stops meaning anything. */
function agoLabel(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const days = daysSince(iso, now);
  if (Number.isNaN(days)) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
  return dayLabel(iso);
}

type Bucket = 'Uncommitted' | 'Today' | 'This week' | 'This month' | 'Earlier';

const BUCKETS: readonly Bucket[] = ['Uncommitted', 'Today', 'This week', 'This month', 'Earlier'];

/** Which heading a row belongs under in a list of recent changes. */
function bucketOf(entry: HistoryEntry, now: number = Date.now()): Bucket {
  if (!entry.changed) return 'Uncommitted';
  const days = daysSince(entry.changed, now);
  if (days <= 0) return 'Today';
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return 'Earlier';
}

// Something with no commits at all is newer than anything with one, which is
// exactly where a reader looking for what just moved expects to find it.
const changedAt = (entry: HistoryEntry): number =>
  entry.changed ? new Date(entry.changed).getTime() : Number.MAX_SAFE_INTEGER;

/** Everything the history knows about, most recently changed first. A subject
 * git has nothing to say about is left out rather than listed as unknown. */
function recentChanges(
  history: KitHistory | undefined,
  root: string,
  subjects: readonly HistorySubject[],
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const subject of subjects) {
    const entry = historyOf(history, root, subject.path);
    if (entry) rows.push({ ...subject, entry });
  }
  return rows.sort((a, b) => changedAt(b.entry) - changedAt(a.entry) || (a.name < b.name ? -1 : 1));
}

export type { HistoryCommit, HistoryEntry, HistoryRow, HistorySubject, KitHistory };
export { agoLabel, BUCKETS, bucketOf, commitUrl, dayLabel, fileUrl, historyOf, recentChanges };
