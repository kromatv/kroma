import type { ImportLibrary } from '@kromatv/client/importers';
import type { ImportFolder, KeptFolder } from '@kromatv/client/imports';

/** Each folder of `libraries`, once, in the order met. */
export function foldersOf(libraries: readonly ImportLibrary[]): string[] {
  return [...new Set(libraries.flatMap((library) => library.folders))];
}

/** The owner's answers once they said where one more folder is. A second
 * answer for a folder replaces the first. */
export function answered(answers: readonly KeptFolder[], answer: KeptFolder): KeptFolder[] {
  return [...answers.filter((held) => held.folder !== answer.folder), answer];
}

/** Where each folder is on this machine: what the owner said, else what the
 * server found. A folder nobody placed has no `here`. */
export function placed(
  found: readonly ImportFolder[],
  answers: readonly KeptFolder[],
): ImportFolder[] {
  return found.map(({ folder, here }) => ({
    folder,
    here: answers.find((held) => held.folder === folder)?.here ?? here,
  }));
}

/** The folders of one library that have a place on this machine. */
export function keptFolders(library: ImportLibrary, places: readonly ImportFolder[]): KeptFolder[] {
  return library.folders.flatMap((folder) => {
    const here = places.find((place) => place.folder === folder)?.here;
    return here ? [{ folder, here }] : [];
  });
}

/** The places of the folders that `libraries` hold, in the order of `places`. */
export function placesOf(
  libraries: readonly ImportLibrary[],
  places: readonly ImportFolder[],
): ImportFolder[] {
  const wanted = foldersOf(libraries);
  return places.filter((place) => wanted.includes(place.folder));
}
