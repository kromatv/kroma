import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const KIT_SRC = fileURLToPath(new URL('../../ui/src', import.meta.url));
const CATALOG_DIR = fileURLToPath(new URL('../../core/src/locales/', import.meta.url));

// The key is the whole match, so it needs no guard for a group that always
// matches. The lookbehind's run of whitespace is BOUNDED: unbounded, it makes
// the variable-length lookbehind super-linear on every source file scanned.
const CALL = /(?<=\b(?:t|msg)\(\s{0,8}(['"`]))[\w.]+(?=\1)/g;
const PLURAL = /_(?:zero|one|two|few|many|other)$/;
const SOURCE = /\.(?:ts|tsx|js|jsx)$/;

function sources(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) sources(full, out);
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Every catalog key the code under `roots` can ask for by name: the argument of
 * a literal `t('key')` or `msg('key')`.
 */
export function messageKeysIn(roots: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const root of roots) {
    for (const file of sources(root)) {
      for (const call of readFileSync(file, 'utf8').matchAll(CALL)) keys.add(call[0]);
    }
  }
  return keys;
}

/** Drop from a catalog every message no `keys` member can reach. A key's plural
 *  variants count as reached, and `lang.*` is always kept: locale detection
 *  matches a written language name against it. */
export function subsetCatalog(
  catalog: Record<string, string>,
  keys: ReadonlySet<string>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, message] of Object.entries(catalog)) {
    if (key.startsWith('lang.') || keys.has(key) || keys.has(key.replace(PLURAL, ''))) {
      kept[key] = message;
    }
  }
  return kept;
}

export interface MessageSubsetOptions {
  roots?: readonly string[];
  keep?: readonly string[];
}

/**
 * Ship only the part of `@kroma/core`'s message catalogs the bundle can reach:
 * the design system's own keys, plus the literals found under `roots` and
 * whatever `keep` names.
 *
 * Only for a target whose every key is a literal: a key assembled at runtime
 * resolves to itself once its message is gone.
 */
export function messageSubset(options: MessageSubsetOptions = {}): Plugin {
  let keys: Set<string> | undefined;
  return {
    name: 'kroma:message-subset',
    enforce: 'pre',
    load(id) {
      const query = id.indexOf('?');
      const file = query < 0 ? id : id.slice(0, query);
      if (!file.startsWith(CATALOG_DIR) || !file.endsWith('.json')) return null;
      keys ??= new Set([
        ...messageKeysIn([KIT_SRC, ...(options.roots ?? [])]),
        ...(options.keep ?? []),
      ]);
      const catalog = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
      return JSON.stringify(subsetCatalog(catalog, keys));
    },
  };
}
