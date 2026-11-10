import { type Dirent, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ANY_DEPTH = '**';

/** Whether `name` is what `pattern` spells, a `*` standing for any run of characters. */
export function matchesWildcard(name: string, pattern: string): boolean {
  const [head = '', ...rest] = pattern.split('*');
  const tail = rest.pop();
  if (tail === undefined) return name === head;
  if (name.length < head.length + tail.length) return false;
  if (!name.startsWith(head) || !name.endsWith(tail)) return false;

  const end = name.length - tail.length;
  let from = head.length;
  for (const part of rest) {
    const at = name.indexOf(part, from);
    if (at === -1 || at + part.length > end) return false;
    from = at + part.length;
  }
  return true;
}

/**
 * Every path under `root` that `pattern` names, absolute. Inside a segment a
 * `*` stands for any run of characters, and a `**` segment for directories at
 * any depth, none included.
 */
export function matchingPaths(root: string, pattern: string): string[] {
  return walk(root, pattern.split('/'));
}

function walk(directory: string, [segment = '', ...rest]: readonly string[]): string[] {
  const entries = list(directory);
  if (segment === ANY_DEPTH) {
    const deeper = entries
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => walk(join(directory, entry.name), [segment, ...rest]));
    return [...walk(directory, rest), ...deeper];
  }

  const named = entries.filter((entry) => matchesWildcard(entry.name, segment));
  if (rest.length === 0) return named.map((entry) => join(directory, entry.name));
  return named
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => walk(join(directory, entry.name), rest));
}

function list(directory: string): Dirent[] {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}
