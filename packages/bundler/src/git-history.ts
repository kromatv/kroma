// The Vite plugin that serves the workbench's history. The reading itself is in
// git-history-read.ts, and the cache it is served through in virtual-cache.ts.

// Spelled with its extension: this module is loaded by Node itself, as a
// dependency of a vite config, and Node's ESM resolver does not guess one.
import {
  type GitHistoryOptions,
  historyFingerprint,
  NO_HISTORY,
  readGitHistory,
} from './git-history-read.ts';
import { cachedVirtualModule } from './virtual-cache.ts';

export type {
  GitHistory,
  GitHistoryOptions,
  HistoryCommit,
  HistoryEntry,
} from './git-history-read.ts';

/**
 * Serves `virtual:kroma-history`: when every component and article under
 * `root` was written and last changed, and the commits behind that.
 *
 * Cached against the revision and the working tree's own changes, because
 * reading the whole log is the one part of this that costs anything. A build
 * made from a tarball, or with no git on the path, still builds - it just ships
 * no history.
 */
export function gitHistory(options: GitHistoryOptions): import('vite').Plugin {
  return cachedVirtualModule({
    id: 'git-history',
    virtual: 'virtual:kroma-history',
    binding: 'HISTORY',
    version: 1,
    fingerprint: async () => `${options.root}\n${await historyFingerprint(options)}`,
    read: () => readGitHistory(options).catch(() => NO_HISTORY),
  });
}
