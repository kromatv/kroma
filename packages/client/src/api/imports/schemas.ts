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

/** A library of the other server, by its name there, that the import did not
 * make because a library of this server already holds its files. */
export const ImportRefusedLibrary = z.object({
  name: z.string(),
  sharesFilesWith: z.string(),
});
export type ImportRefusedLibrary = z.infer<typeof ImportRefusedLibrary>;

/** What an import did so far, by kind, and the libraries it did not make. The
 * server saves it after each read, so a running import counts live. */
export const ImportReport = z.object({
  libraries: ImportTally,
  users: ImportTally,
  titles: ImportTally,
  states: ImportTally,
  plays: ImportTally,
  refusedLibraries: z.array(ImportRefusedLibrary).default([]),
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

/** One folder of the other server, and where it is on this machine. A folder
 * with no `here` is one the server did not find: the owner is asked for it. */
export const ImportFolder = z.object({ folder: z.string(), here: z.string().optional() });
export type ImportFolder = z.infer<typeof ImportFolder>;

export const ImportFolderList = z.object({ folders: z.array(ImportFolder) });
export type ImportFolderList = z.infer<typeof ImportFolderList>;

/** The folders a review is about to show for one server, as that server names
 * them. */
export interface ImportFolderAsk {
  importer: ModuleId;
  server: ImportServerId;
  folders: string[];
}

/** One folder the owner confirmed: `folder` as the other server names it,
 * `here` as this machine does. */
export interface KeptFolder {
  folder: string;
  here: string;
}

/** One library the owner kept, with the folders they confirmed for it. A
 * library is made over no other folder. */
export interface KeptLibrary {
  id: string;
  folders: KeptFolder[];
}

/** What the owner asks an import to bring: the server, and the libraries and
 * the users they kept on the review. */
export interface ImportRequest {
  importer: ModuleId;
  signIn: ImportSignInId;
  server: { id: ImportServerId; name: string };
  selection: { libraries: KeptLibrary[]; users: { id: string }[] };
}
