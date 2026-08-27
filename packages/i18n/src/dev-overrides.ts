import type { CatalogSource } from './types';

/** Renders a message as something that names its key rather than its text.
 *  `from` is the catalog that would have answered, or `undefined` when none
 *  does: the engine has already walked the chain, so an inspector only formats. */
export type KeyInspector = (key: string, from: CatalogSource | undefined, locale: string) => string;

let inspector: KeyInspector | null = null;
let locale: string | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function changed(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function activeKeyInspector(): KeyInspector | null {
  return inspector;
}

/** Route every message every instance renders through `next`, or `null` to
 *  stop. Process-wide on purpose: the dev tools are one switch for the page,
 *  and they reach an instance they were never handed. */
export function installKeyInspector(next: KeyInspector | null): void {
  if (inspector === next) return;
  inspector = next;
  changed();
}

export function activeLocaleOverride(): string | null {
  return locale;
}

/** Render every provider in `next` instead of the locale the app resolved, or
 *  `null` to give it back. Nothing is persisted and no account preference
 *  moves: this lasts as long as the page does. */
export function installLocaleOverride(next: string | null): void {
  if (locale === next) return;
  locale = next;
  changed();
}

export function overridesRevision(): number {
  return revision;
}

export function onOverridesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
