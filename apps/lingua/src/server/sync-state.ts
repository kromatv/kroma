import type { SyncState } from '#site/lib/views';
import type { Project } from '#site/store/store';

/** Where the sync of a held project stands, from what its last passes left in the store. */
export function syncOf(project: Project): SyncState {
  if (project.syncError !== null) return { kind: 'failed', error: project.syncError };
  if (project.branchSha !== null && project.branchSha !== project.headSha)
    return { kind: 'reading', progress: project.progress };
  return project.headSha === null ? { kind: 'waiting' } : { kind: 'current' };
}
