import type { JobDetail } from '@kromatv/client/jobs';

/** How the last scheduled backup went: failed, with the reason its run gave,
 * saved, or never run. `at` is when the run started, in epoch milliseconds. */
export type LastBackup =
  | { kind: 'failed'; at: number; error: string | null }
  | { kind: 'saved'; at: number }
  | { kind: 'none' };

/** The last scheduled backup as the backup task's detail tells it. A run still
 * going, or cancelled, counts as none until one ends saved or failed. */
export function lastBackup(detail: JobDetail | undefined): LastBackup {
  const run = detail?.info.lastRun;
  if (run?.status === 'failed') {
    return { kind: 'failed', at: run.startedAt, error: run.error };
  }
  if (run?.status === 'success') {
    return { kind: 'saved', at: run.startedAt };
  }
  return { kind: 'none' };
}
