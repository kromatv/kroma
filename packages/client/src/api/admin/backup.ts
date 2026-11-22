import { z } from 'zod';
import type { RequestContext } from '../../core/http';

export const BackupImportResult = z.object({
  imported: z.record(z.string(), z.number()),
  rescanStarted: z.boolean(),
});
export type BackupImportResult = z.infer<typeof BackupImportResult>;

/** The libraries of this server a restore would remove, each by id and name. */
export const BackupPreview = z.object({
  removedLibraries: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type BackupPreview = z.infer<typeof BackupPreview>;

/** The backups the server saves by itself, each night by default. `folder` is
 * where they go: the one the owner chose (`chosen`), else the data folder's
 * own. `keep` is how many the folder keeps. */
export const BackupSchedule = z.object({
  enabled: z.boolean(),
  folder: z.string(),
  chosen: z.boolean(),
  keep: z.number(),
});
export type BackupSchedule = z.infer<typeof BackupSchedule>;

/** A change to the scheduled backups. An empty `folder` goes back to the data
 * folder's own. */
export interface BackupScheduleChange {
  enabled?: boolean;
  folder?: string;
  keep?: number;
}

export interface BackupImportOptions {
  password?: string;
  reset?: boolean;
}

const flag = (on?: boolean) => (on ? '1' : undefined);

function hexUtf8(s?: string): string | undefined {
  if (!s) {
    return undefined;
  }
  return Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function headers(opts?: BackupImportOptions) {
  return {
    'x-backup-password': hexUtf8(opts?.password),
    'x-backup-reset': flag(opts?.reset),
  };
}

/** Portable backup: take one out, put one back. Requires `settings.manage`. */
export function backupApi(ctx: RequestContext) {
  return {
    /** The scheduled backups as the server holds them. */
    schedule: () => ctx.get('/admin/backup/schedule', BackupSchedule),

    /** Turns the scheduled backups on or off, picks their folder or how many to
     * keep. The server refuses a folder its folder picker would not offer. */
    changeSchedule: (change: BackupScheduleChange) =>
      ctx.put('/admin/backup/schedule', BackupSchedule, { body: change }),

    /** A `password` encrypts the archive (`.kroma`), else it is a plain `.zip`. */
    export: (password?: string) =>
      ctx.blob('/admin/backup/export', { headers: { 'x-backup-password': hexUtf8(password) } }),

    /** Restores a `.zip`/`.kroma`/legacy `.json`, then triggers a re-scan so the
     * catalogue regenerates with matching item ids. */
    import: (file: Blob, opts?: BackupImportOptions) =>
      ctx.upload('/admin/backup/import', file, BackupImportResult, { headers: headers(opts) }),

    /** What `import` with the same file and options would remove, restoring nothing. */
    preview: (file: Blob, opts?: BackupImportOptions) =>
      ctx.upload('/admin/backup/import/preview', file, BackupPreview, { headers: headers(opts) }),
  };
}
