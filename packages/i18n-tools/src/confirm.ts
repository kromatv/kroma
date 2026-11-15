import { digest, type Lock, writeLock } from './lock.ts';
import { type CatalogSet, lockPath } from './set.ts';
import { inspectLocale, readSource } from './status.ts';

/** Which messages a confirmation is about: exactly these keys, or every key
 *  that starts with one of these prefixes, all of them when there is none. */
export type Selection = readonly string[] | { readonly prefixes: readonly string[] };

function selects(selection: Selection): (key: string) => boolean {
  if ('prefixes' in selection) {
    const { prefixes } = selection;
    return (key) => prefixes.length === 0 || prefixes.some((prefix) => key.startsWith(prefix));
  }
  const keys = new Set(selection);
  return (key) => keys.has(key);
}

/**
 * Record that translations hold as they read. An outdated one is current
 * again: the source moved in a way that changes nothing for this language. One
 * a machine wrote counts as reviewed. Returns the keys that had something to
 * settle.
 */
export function confirm(set: CatalogSet, locale: string, selection: Selection): string[] {
  const source = readSource(set);
  const status = inspectLocale(set, source, locale);
  const lock: Lock = new Map(status.nextLock);
  const confirmed = [...status.outdated, ...status.unreviewed].filter(selects(selection));
  for (const key of confirmed) {
    const entry = lock.get(key);
    const message = source.messages.get(key);
    if (entry && message)
      lock.set(key, { source: digest(message), translation: entry.translation });
  }
  writeLock(lockPath(set, locale), lock);
  return confirmed;
}
