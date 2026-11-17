import { z } from 'zod';
import { EngineField, ModuleId } from '../modules';
import { ImportServerId, ImportSignInId } from './ids';

/** One module that reads another media server, with the form of its sign-in.
 * An installed one has its icon at the module icon route, and one the official
 * registry offers carries it inline. Only a `running` one can be asked. */
export const Importer = z.object({
  id: ModuleId,
  name: z.string(),
  label: z.string().optional(),
  icon: z.string().optional(),
  installed: z.boolean(),
  running: z.boolean(),
  fields: z.array(EngineField),
});
export type Importer = z.infer<typeof Importer>;

/** The importers installed here, then the ones the official registry offers.
 * `registryError` says why the registry could not be read, and the list then
 * holds the installed ones alone. */
export const ImporterList = z.object({
  importers: z.array(Importer),
  registryError: z.string().optional(),
});
export type ImporterList = z.infer<typeof ImporterList>;

export const ImportServer = z.object({
  id: ImportServerId,
  name: z.string(),
  address: z.string().optional(),
});
export type ImportServer = z.infer<typeof ImportServer>;

/** Why a sign-in was turned down. A reason this client does not know reads as
 * `other`. */
export const ImportRefusal = z
  .enum(['credentials', 'unreachable', 'notAdministrator', 'expired', 'unsupported', 'other'])
  .catch('other');
export type ImportRefusal = z.infer<typeof ImportRefusal>;

/** Where a sign-in to another server stands. `ready` names the sign-in the
 * importer keeps and the servers it reaches. `pending` gives the page the owner
 * opens and the id to ask again with, and `expiresAt` is unix seconds. */
export const ImportSignIn = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    signIn: ImportSignInId,
    servers: z.array(ImportServer),
  }),
  z.object({
    status: z.literal('pending'),
    pending: z.string().nonempty(),
    url: z.string().startsWith('https://'),
    expiresAt: z.number().optional(),
  }),
  z.object({
    status: z.literal('refused'),
    reason: ImportRefusal,
    message: z.string().optional(),
  }),
]);
export type ImportSignIn = z.infer<typeof ImportSignIn>;

/** What a library of the other server holds. `other` is every kind KROMA does
 * not play. */
export const ImportLibraryKind = z.enum(['movies', 'shows', 'mixed', 'other']).catch('other');
export type ImportLibraryKind = z.infer<typeof ImportLibraryKind>;

export const ImportLibrary = z.object({
  id: z.string(),
  name: z.string(),
  kind: ImportLibraryKind,
  folders: z.array(z.string()),
});
export type ImportLibrary = z.infer<typeof ImportLibrary>;

/** One user of the other server. A user with neither `allLibraries` nor a
 * library saw none. `finerLimits` names what limited them beyond libraries,
 * such as `rating`. `stateNeeds` says what would unlock a locked watch state,
 * such as `pin`. */
export const ImportUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().optional(),
  signedIn: z.boolean(),
  allLibraries: z.boolean(),
  libraries: z.array(z.string()),
  finerLimits: z.array(z.string()),
  stateLocked: z.boolean(),
  stateNeeds: z.string().optional(),
});
export type ImportUser = z.infer<typeof ImportUser>;

/** How much the other server holds. A missing count was not counted. */
export const ImportCounts = z.object({
  titles: z.number().optional(),
  states: z.number().optional(),
  plays: z.number().optional(),
});
export type ImportCounts = z.infer<typeof ImportCounts>;

/** What one server holds, read before anything is imported. `leftBehind` is
 * the keys of what it holds that an import does not bring, such as
 * `playlists`. */
export const ImportSurvey = z.object({
  libraries: z.array(ImportLibrary),
  users: z.array(ImportUser),
  counts: ImportCounts,
  leftBehind: z.array(z.string()),
});
export type ImportSurvey = z.infer<typeof ImportSurvey>;
