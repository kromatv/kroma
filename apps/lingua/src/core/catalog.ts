import { z } from 'zod';

/** One catalog file's messages, in the order the file lists them. */
export type Messages = Record<string, string>;

const Flat = z.record(z.string(), z.string());

/** A flat `{ "key": "message" }` file, or null when the text is anything else. */
export function parseMessages(text: string): Messages | null {
  try {
    const result = Flat.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** The file text for `messages`, in the shape the repository's formatter writes. */
export function serializeMessages(messages: Messages): string {
  return `${JSON.stringify(messages, null, 2)}\n`;
}

/**
 * `base` with `edits` written in. A key the file already has keeps its place; a
 * new one lands after the nearest key before it in `order`, the source file's
 * order, so a diff shows only the lines that changed.
 */
export function applyEdits(base: Messages, edits: Messages, order: readonly string[]): Messages {
  const entries: [string, string][] = Object.entries(base).map(([key, value]) => [
    key,
    edits[key] ?? value,
  ]);
  const rank = (key: string) => (order.indexOf(key) === -1 ? Infinity : order.indexOf(key));
  const added = Object.entries(edits)
    .filter(([key]) => !Object.hasOwn(base, key))
    .sort(([a], [b]) => rank(a) - rank(b));
  for (const [key, value] of added) {
    const before = entries.reduce(
      (last, [present], i) => (rank(present) < rank(key) ? i : last),
      -1,
    );
    entries.splice(before + 1, 0, [key, value]);
  }
  return Object.fromEntries(entries);
}
