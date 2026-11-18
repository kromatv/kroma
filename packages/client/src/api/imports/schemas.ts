import { z } from 'zod';
import { ImportServerId, ImportSignInId } from '../importers';
import { ModuleId } from '../modules';
import { ImportId } from './ids';

/** Where an import stands. */
export const ImportStatus = z.enum(['queued', 'running', 'completed', 'cancelled', 'failed']);
export type ImportStatus = z.infer<typeof ImportStatus>;

/** How much of one kind an import read, brought, and matched to nothing. */
export const ImportTally = z.object({
  read: z.number().default(0),
  brought: z.number().default(0),
  unmatched: z.number().default(0),
});
export type ImportTally = z.infer<typeof ImportTally>;

/** What an import did so far, by kind. The server saves it after each read, so
 * a running import counts live. */
export const ImportReport = z.object({
  libraries: ImportTally,
  users: ImportTally,
  titles: ImportTally,
  states: ImportTally,
  plays: ImportTally,
});
export type ImportReport = z.infer<typeof ImportReport>;

/** Why an import ended with an error. A reason this client does not know reads
 * as `internal`. */
export const ImportFailure = z.object({
  reason: z
    .enum([
      'importerAbsent',
      'importerFailed',
      'importerUnreadable',
      'repeatedCursor',
      'interrupted',
      'internal',
    ])
    .catch('internal'),
  message: z.string().optional(),
});
export type ImportFailure = z.infer<typeof ImportFailure>;

/** One import: which server it reads, through which importer, where it stands
 * and what it did. */
export const Import = z.object({
  id: ImportId,
  importer: ModuleId,
  server: z.object({ id: ImportServerId, name: z.string().default('') }),
  signIn: ImportSignInId.optional(),
  status: ImportStatus,
  runId: z.string().optional(),
  createdAt: z.number(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  report: ImportReport,
  unmatchedTitles: z.number(),
  failure: ImportFailure.optional(),
});
export type Import = z.infer<typeof Import>;

/** `POST /admin/imports`: the import that was queued, and the job run that
 * carries it. */
export const ImportStarted = z.object({ id: ImportId, runId: z.string().optional() });
export type ImportStarted = z.infer<typeof ImportStarted>;

export const ImportList = z.object({ imports: z.array(Import) });
export type ImportList = z.infer<typeof ImportList>;

/** What the owner asks an import to bring: the server, and the libraries and
 * the users they kept on the review. */
export interface ImportRequest {
  importer: ModuleId;
  signIn: ImportSignInId;
  server: { id: ImportServerId; name: string };
  selection: { libraries: { id: string }[]; users: { id: string }[] };
}
