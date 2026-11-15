import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { CatalogSet } from './set.ts';
import type { Source } from './status.ts';

/** What a translator is told, beside the locale folders: a flat map from a
 *  key, a key prefix ending in a dot, or {@link EVERYWHERE}, to a note. */
export const NOTES_FILE = 'notes.json';

/** The note every message carries: the product, its tone, its glossary. */
export const EVERYWHERE = '*';

const Notes = z.record(z.string(), z.string());

function notesPath(set: CatalogSet): string | null {
  return set.layout === 'folder' ? join(set.dir, NOTES_FILE) : null;
}

/** The notes of a set. A set that keeps one file per language has nowhere to
 *  keep any, and has none. */
export function readNotes(set: CatalogSet): Map<string, string> {
  const path = notesPath(set);
  if (path === null || !existsSync(path)) return new Map();
  const { $schema: _pointer, ...notes } = Notes.parse(JSON.parse(readFileSync(path, 'utf8')));
  return new Map(Object.entries(notes));
}

/** Everything written about `key`, the widest note first: the one for every
 *  message, each prefix it falls under, then its own. */
export function noteFor(notes: ReadonlyMap<string, string>, key: string): string | undefined {
  const said = [...notes]
    .filter(([about]) => concerns(about, key))
    .sort(([a], [b]) => breadth(a) - breadth(b))
    .map(([, note]) => note);
  return said.length > 0 ? said.join('\n') : undefined;
}

function concerns(about: string, key: string): boolean {
  if (about === EVERYWHERE || about === key) return true;
  return about.endsWith('.') && key.startsWith(about);
}

function breadth(about: string): number {
  return about === EVERYWHERE ? -1 : about.length;
}

/** The notes that are about nothing: a key that is no message, or a prefix no
 *  message starts with. */
export function strayNotes(notes: ReadonlyMap<string, string>, source: Source): string[] {
  const keys = [...source.bases];
  return [...notes.keys()].filter((about) => {
    if (about === EVERYWHERE) return false;
    if (about.endsWith('.')) return !keys.some((key) => key.startsWith(about));
    return !source.bases.has(about);
  });
}

/** Write a note, or remove it with an empty text. */
export function writeNote(set: CatalogSet, about: string, text: string): void {
  const path = notesPath(set);
  if (path === null) throw new Error(`${set.name} keeps one file per language, and no notes`);
  const notes = readNotes(set);
  if (text === '') notes.delete(about);
  else notes.set(about, text);
  const ordered = Object.fromEntries([...notes].sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
}
