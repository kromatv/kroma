import { readFileSync } from 'node:fs';
import { LABEL_NAMESPACE, namespaceOf } from '@kromatv/i18n/model';
import type { Source } from './status.ts';

// A string that opens like a key: `'admin.title'`, `"jobs.` before a Rust
// `{kind}`, or the head of a template, `` `genre.${slug}` ``.
const LITERAL = /['"`]([A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9_.-]*)(\$\{|\{)?/g;

/** What the code names: keys written out, and the heads of keys it builds. */
export interface Named {
  readonly exact: Set<string>;
  readonly prefixes: Set<string>;
}

export function namedIn(texts: Iterable<string>): Named {
  const exact = new Set<string>();
  const prefixes = new Set<string>();
  for (const text of texts) {
    for (const [, literal = '', built] of text.matchAll(LITERAL)) {
      if (built !== undefined || literal.endsWith('.')) prefixes.add(literal);
      else exact.add(literal);
    }
  }
  return { exact, prefixes };
}

export function namedInFiles(paths: readonly string[]): Named {
  function* texts() {
    for (const path of paths) yield readFileSync(path, 'utf8');
  }
  return namedIn(texts());
}

// A literal names its key and every key below it: Rust builds
// `email.reset.subject` from `"email.reset"` and a suffix.
function under(key: string, exact: ReadonlySet<string>): boolean {
  for (let cut = key.length; cut > 0; cut = key.lastIndexOf('.', cut - 1)) {
    if (exact.has(key.slice(0, cut))) return true;
  }
  return false;
}

/**
 * The messages nothing names: no string is their key, and no string a key is
 * built from starts it. A message the code reaches some other way, a key that
 * arrives in data or is glued with `+`, shows here too, so this is a list to
 * read before deleting from. Language names are left out: they are read by
 * code, never by key.
 */
export function unusedMessages(source: Source, named: Named): string[] {
  const byNamespace = new Map<string, string[]>();
  for (const prefix of named.prefixes) {
    const own = byNamespace.get(namespaceOf(prefix)) ?? [];
    own.push(prefix);
    byNamespace.set(namespaceOf(prefix), own);
  }
  const reached = (key: string) =>
    under(key, named.exact) ||
    (byNamespace.get(namespaceOf(key)) ?? []).some((prefix) => key.startsWith(prefix));
  return [...source.bases].filter((key) => namespaceOf(key) !== LABEL_NAMESPACE && !reached(key));
}
