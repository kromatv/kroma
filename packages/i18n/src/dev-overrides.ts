import type { CatalogSource, TVars } from './types';

/** One message, as the engine resolved it. `from` is the catalog that
 *  answered, or `undefined` when none did, and `text` is what would have
 *  rendered: the chain has already been walked, so an inspector only formats,
 *  and one that merely watches hands `text` straight back. */
export interface Rendered {
  readonly key: string;
  readonly from: CatalogSource | undefined;
  readonly locale: string;
  readonly text: string;
  readonly vars: TVars | undefined;
}

/** Renders a message as something other than its text: the key it came from,
 *  a mark an overlay reads, or the text itself for an inspector that only
 *  watches. */
export type KeyInspector = (rendered: Rendered) => string;

/** What the app renders in: every locale it can answer, and the one it
 *  resolved for itself before any override. */
export interface AppLocales {
  readonly codes: readonly string[];
  readonly resolved: string;
}

interface Overrides {
  inspector: KeyInspector | null;
  app: AppLocales | null;
  locale: string | null;
  revision: number;
  readonly listeners: Set<() => void>;
}

// One record for the page, not one per copy of this module. A module's front
// end is its own bundle carrying its own engine, so a switch held in a module
// variable would reach the core's strings and stop at the module's.
const SHARED = '__kromaI18nOverrides';

function overrides(): Overrides {
  const found = Reflect.get(globalThis, SHARED) as Overrides | undefined;
  if (found) return found;
  const fresh: Overrides = {
    inspector: null,
    app: null,
    locale: null,
    revision: 0,
    listeners: new Set(),
  };
  Reflect.set(globalThis, SHARED, fresh);
  return fresh;
}

function notify(): void {
  for (const listener of overrides().listeners) listener();
}

function changed(): void {
  overrides().revision += 1;
  notify();
}

export function activeKeyInspector(): KeyInspector | null {
  return overrides().inspector;
}

/** Route every message every instance renders through `next`, or `null` to
 *  stop. Page-wide on purpose, through a record on `globalThis`: the dev tools
 *  are one switch, and they reach an engine they were never handed - a module's
 *  front end bundles its own. */
export function installKeyInspector(next: KeyInspector | null): void {
  const state = overrides();
  if (state.inspector === next) return;
  state.inspector = next;
  changed();
}

/** Say what the app renders in, so the tools can offer its locales without
 *  being handed the app's own table. `null` when the last provider unmounts. */
export function installAppLocales(next: AppLocales | null): void {
  const state = overrides();
  const held = state.app;
  if (held === next) return;
  if (next && held?.resolved === next.resolved && same(held.codes, next.codes)) return;
  state.app = next;
  notify();
}

export function activeAppLocales(): AppLocales | null {
  return overrides().app;
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((code, at) => code === b[at]);
}

export function activeLocaleOverride(): string | null {
  return overrides().locale;
}

/** Render every provider in `next` instead of the locale the app resolved, or
 *  `null` to give it back. Nothing is persisted and no account preference
 *  moves: this lasts as long as the page does. */
export function installLocaleOverride(next: string | null): void {
  const state = overrides();
  if (state.locale === next) return;
  state.locale = next;
  changed();
}

export function overridesRevision(): number {
  return overrides().revision;
}

export function onOverridesChange(listener: () => void): () => void {
  const { listeners } = overrides();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
