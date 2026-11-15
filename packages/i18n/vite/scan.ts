import { namespaceOf, namespaceOfFile } from '../src/layout.ts';

const KEY_LITERAL = /['"`]([A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9_.-]*)/g;
const COMMENT_OPENERS = ['//', '/*', '*'];

/** What one module names of each catalog file: the keys written out, and
 *  whether it also builds keys from a prefix, which reads the file whole. */
export type Usage = Map<string, { keys: Set<string>; whole: boolean }>;

/** The entry of `usage` for a catalog file, made on first use. */
export function noted(usage: Usage, file: string): { keys: Set<string>; whole: boolean } {
  let own = usage.get(file);
  if (!own) {
    own = { keys: new Set(), whole: false };
    usage.set(file, own);
  }
  return own;
}

function isComment(line: string): boolean {
  const text = line.trimStart();
  return COMMENT_OPENERS.some((opener) => text.startsWith(opener));
}

function isPrefix(literal: string, keys: readonly string[]): boolean {
  const stem = literal.endsWith('.') ? literal : `${literal}.`;
  return keys.some((key) => key.startsWith(stem));
}

/** The messages a module names, by catalog file, judged by its string
 *  literals: `'admin.title'` names that key in the file holding it,
 *  `` `pipeline.t.${stage}` `` names every file with a key starting
 *  `pipeline.t.` whole, and `'pipeline.stats'` names nothing when no such key
 *  exists. A literal in a comment names nothing. `keys` maps a file to the keys
 *  the source language keeps in it. */
export function keysNamedIn(code: string, keys: ReadonlyMap<string, readonly string[]>): Usage {
  const usage: Usage = new Map();
  const judged = new Set<string>();
  const read = code
    .split('\n')
    .filter((line) => !isComment(line))
    .join('\n');
  for (const [, literal = ''] of read.matchAll(KEY_LITERAL)) {
    if (judged.has(literal)) continue;
    judged.add(literal);
    const namespace = namespaceOf(literal);
    for (const [file, own] of keys) {
      if (namespaceOfFile(file) !== namespace) continue;
      if (own.includes(literal)) noted(usage, file).keys.add(literal);
      if (isPrefix(literal, own)) noted(usage, file).whole = true;
    }
  }
  return usage;
}

/** The catalog files a module reads, by the same judgement, in a stable order. */
export function catalogsNamedIn(
  code: string,
  keys: ReadonlyMap<string, readonly string[]>,
): string[] {
  return [...keysNamedIn(code, keys).keys()].sort((a, b) => a.localeCompare(b));
}
