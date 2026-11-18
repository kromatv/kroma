import type {
  ImportLibrary,
  ImportServer,
  ImportServerId,
  ImportSignInId,
  ImportSurvey,
  ImportUser,
} from '@kromatv/client/importers';
import type { ImportRequest } from '@kromatv/client/imports';
import type { ModuleId } from '@kromatv/client/modules';

/** The server an import reads: through which importer, with which sign-in. */
export interface ImportTarget {
  importer: ModuleId;
  signIn: ImportSignInId;
  server: ImportServerId;
}

/** What the owner left out on the review, and the servers their sign-in
 * reaches. */
export interface ReviewChoices {
  servers: readonly ImportServer[];
  skippedLibraries: readonly string[];
  skippedUsers: readonly string[];
}

/** Whether KROMA can take a library: one of films, of shows, or of both. */
export function importable(library: ImportLibrary): boolean {
  return library.kind !== 'other';
}

/** The ids still selected, of `all`, once `skipped` are left out. */
export function keptIds(all: readonly string[], skipped: readonly string[]): string[] {
  return all.filter((id) => !skipped.includes(id));
}

/** The ids left out, of `all`, when only `kept` stay selected. */
export function skippedIds(all: readonly string[], kept: readonly string[]): string[] {
  return all.filter((id) => !kept.includes(id));
}

/** How many libraries a user saw on the other server: all of them, some, or
 * none. */
export function sight(user: ImportUser): 'all' | 'some' | 'none' {
  if (user.allLibraries) {
    return 'all';
  }
  return user.libraries.length > 0 ? 'some' : 'none';
}

/** What the owner must know about a user before bringing them over. */
export function cautions(user: ImportUser): ('you' | 'limited' | 'locked')[] {
  const notes: ('you' | 'limited' | 'locked')[] = [];
  if (user.signedIn) {
    notes.push('you');
  }
  if (user.finerLimits.length > 0) {
    notes.push('limited');
  }
  if (user.stateLocked) {
    notes.push('locked');
  }
  return notes;
}

/** What the server is asked to import: the server the owner chose, and the
 * libraries and the users they kept. A library KROMA cannot take is never
 * asked for. */
export function importRequest(
  target: ImportTarget,
  choices: ReviewChoices,
  survey: ImportSurvey,
): ImportRequest {
  const libraries = survey.libraries.filter(importable).map((library) => library.id);
  const users = survey.users.map((user) => user.id);
  const name = choices.servers.find((server) => server.id === target.server)?.name ?? '';
  return {
    importer: target.importer,
    signIn: target.signIn,
    server: { id: target.server, name },
    selection: {
      libraries: keptIds(libraries, choices.skippedLibraries).map((id) => ({ id })),
      users: keptIds(users, choices.skippedUsers).map((id) => ({ id })),
    },
  };
}
