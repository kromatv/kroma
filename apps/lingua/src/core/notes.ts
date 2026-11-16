import { z } from 'zod';

const EVERYWHERE = '*';

const Notes = z.record(z.string(), z.string());

/** The notes of a project's `notes.json`, by what they are about: a key, a prefix ending in a dot, or `*`. */
export function parseNotes(text: string | undefined): ReadonlyMap<string, string> {
  if (text === undefined) {
    return new Map();
  }
  try {
    const { $schema: _pointer, ...notes } = Notes.parse(JSON.parse(text));
    return new Map(Object.entries(notes));
  } catch {
    return new Map();
  }
}

function concerns(about: string, key: string): boolean {
  if (about === EVERYWHERE || about === key) {
    return true;
  }
  return about.endsWith('.') && key.startsWith(about);
}

function breadth(about: string): number {
  return about === EVERYWHERE ? -1 : about.length;
}

/** Every note about the message `key`, the widest first and its own last. */
export function notesFor(notes: ReadonlyMap<string, string>, key: string): string[] {
  return [...notes]
    .filter(([about]) => concerns(about, key))
    .sort(([a], [b]) => breadth(a) - breadth(b))
    .map(([, note]) => note);
}
