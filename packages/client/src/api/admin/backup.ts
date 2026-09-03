import { z } from 'zod';
import type { RequestContext } from '../../core/http';

export const BackupImportResult = z.object({
  imported: z.record(z.string(), z.number()),
  rescanStarted: z.boolean(),
});
export type BackupImportResult = z.infer<typeof BackupImportResult>;

export interface BackupImportOptions {
  password?: string;
  reset?: boolean;
}

const flag = (on?: boolean) => (on ? '1' : undefined);

function hexUtf8(s?: string): string | undefined {
  if (!s) return undefined;
  return Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Portable backup: take one out, put one back. Requires `settings.manage`. */
export function backupApi(ctx: RequestContext) {
  return {
    /** A `password` encrypts the archive (`.kroma`), else it is a plain `.zip`. */
    export: (password?: string) =>
      ctx.blob('/admin/backup/export', { headers: { 'x-backup-password': hexUtf8(password) } }),

    /** Restores a `.zip`/`.kroma`/legacy `.json`, then triggers a re-scan so the
     * catalogue regenerates with matching item ids. */
    import: (file: Blob, opts?: BackupImportOptions) =>
      ctx.upload('/admin/backup/import', file, BackupImportResult, {
        headers: {
          'x-backup-password': hexUtf8(opts?.password),
          'x-backup-reset': flag(opts?.reset),
        },
      }),
  };
}
