import type { ImportLibraryKind, ImportRefusal } from '@kromatv/client/importers';

/** Why the other server turned a sign-in down, in the owner's words. */
export const REFUSAL_LINE = {
  credentials: 'setup.importRefusedCredentials',
  unreachable: 'setup.importRefusedUnreachable',
  notAdministrator: 'setup.importRefusedNotAdministrator',
  expired: 'setup.importRefusedExpired',
  unsupported: 'setup.importRefusedUnsupported',
  other: 'setup.importRefusedOther',
} as const satisfies Record<ImportRefusal, string>;

/** What a library of the other server holds. */
export const KIND_NAME = {
  movies: 'setup.importKindMovies',
  shows: 'setup.importKindShows',
  mixed: 'setup.importKindMixed',
  other: 'setup.importKindOther',
} as const satisfies Record<ImportLibraryKind, string>;

const LEFT_BEHIND = {
  passwords: 'setup.importLeftPasswords',
  playlists: 'setup.importLeftPlaylists',
  collections: 'setup.importLeftCollections',
  watchlist: 'setup.importLeftWatchlist',
  liveTv: 'setup.importLeftLiveTv',
  plugins: 'setup.importLeftPlugins',
  transcoder: 'setup.importLeftTranscoder',
  otherLibraries: 'setup.importLeftOtherLibraries',
} as const;

type LeftBehindKey = keyof typeof LEFT_BEHIND;

function known(key: string): key is LeftBehindKey {
  return key in LEFT_BEHIND;
}

/** The message that names one thing an import does not bring, or none for a
 * key this client does not know. */
export function leftBehindLine(key: string): (typeof LEFT_BEHIND)[LeftBehindKey] | null {
  return known(key) ? LEFT_BEHIND[key] : null;
}
