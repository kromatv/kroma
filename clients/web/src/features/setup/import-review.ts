import type { ImportLibrary, ImportUser } from '@kromatv/client/importers';

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
