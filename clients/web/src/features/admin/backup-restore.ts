import type { BackupImportOptions, BackupPreview } from '@kromatv/client/admin';

/** The libraries of this server a restore would remove. */
export type RemovedLibraries = BackupPreview['removedLibraries'];

/** Whether a restore asks the server first which libraries it would remove:
 * only a reset does, and only until the owner has seen the answer. */
export function asksFirst(
  options: BackupImportOptions,
  removing: RemovedLibraries | null,
): boolean {
  return options.reset === true && removing === null;
}

/** What a preview's answer leads to: the libraries to show the owner before
 * the restore, or `null` when it removes none and the restore goes on. */
export function toShow(removed: RemovedLibraries): RemovedLibraries | null {
  return removed.length > 0 ? removed : null;
}

/** The key of the import dialog's confirm label. */
export function confirmLabelKey({
  busy,
  removing,
}: {
  busy: boolean;
  removing: RemovedLibraries | null;
}): 'admin.backupImporting' | 'admin.backupRestoreRemove' | 'admin.backupRestoreConfirm' {
  if (busy) {
    return 'admin.backupImporting';
  }
  return removing ? 'admin.backupRestoreRemove' : 'admin.backupRestoreConfirm';
}
