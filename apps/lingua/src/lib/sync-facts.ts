import type { Progress, SyncState } from '#site/lib/views';

/** How a repository's sync reads at a glance: the badge's tone and word, how far a read has come, and the line under it. */
export interface SyncFacts {
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  label: string;
  ratio: number | null;
  detail: string | null;
}

function readingFacts(progress: Progress | null): SyncFacts {
  return {
    tone: 'warning',
    label: 'Syncing',
    ratio: progress && progress.total > 0 ? progress.done / progress.total : null,
    detail: progress
      ? `Read ${progress.done} of ${progress.total} changed files`
      : 'Reading the latest changes',
  };
}

const SETTLED = {
  current: { tone: 'success', label: 'Up to date', ratio: null, detail: null },
  waiting: { tone: 'neutral', label: 'Not read yet', ratio: null, detail: null },
} as const satisfies Record<string, SyncFacts>;

/** What `sync` says to a reader. */
export function syncFacts(sync: SyncState): SyncFacts {
  if (sync.kind === 'reading') {
    return readingFacts(sync.progress);
  }
  if (sync.kind === 'failed') {
    return { tone: 'danger', label: 'Sync failed', ratio: null, detail: sync.error };
  }
  return SETTLED[sync.kind];
}

/** `sync` while the page itself drives a pass: reading, with what it already counted. */
export function whileDriven(sync: SyncState): SyncState {
  return sync.kind === 'reading' ? sync : { kind: 'reading', progress: null };
}

/** Whether any of `syncs` is still reading, which is when a page keeps asking for news. */
export function anyReading(syncs: readonly SyncState[]): boolean {
  return syncs.some((sync) => sync.kind === 'reading');
}

/** How far the repositories step has come: `working` while one still reads, `done` once every one holds its branch, else `todo`. */
export function repositoriesState(syncs: readonly SyncState[]): 'done' | 'todo' | 'working' {
  if (anyReading(syncs)) {
    return 'working';
  }
  return syncs.length > 0 && syncs.every((sync) => sync.kind === 'current') ? 'done' : 'todo';
}
