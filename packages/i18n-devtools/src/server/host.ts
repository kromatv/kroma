/** One message as the dev server reads it off the catalogs: the source
 *  language's forms to read against, the forms the asked locale writes itself,
 *  and every placeholder a text may name. */
export interface CatalogMessage {
  readonly set: string;
  readonly source: string;
  readonly reference: Readonly<Record<string, string>>;
  readonly forms: Readonly<Record<string, string>>;
  readonly variables: readonly string[];
}

/** The keys of one scope whose translation the lock does not vouch for. No
 *  scope is the app's own catalogs. */
export interface Pending {
  readonly scope: string | null;
  readonly outdated: readonly string[];
  readonly unreviewed: readonly string[];
}

/** How one locale stands against the source language: the share a reader gets
 *  in it, the three counts, and the keys behind two of them, by scope. */
export interface TranslationStatus {
  readonly locale: string;
  readonly coverage: number;
  readonly missing: number;
  readonly outdated: number;
  readonly unreviewed: number;
  readonly sets: readonly Pending[];
}

/** Where the repository translates: the Lingua site, and the `<owner>/<repo>`
 *  it files the repository under. */
export interface Lingua {
  readonly url: string;
  readonly project: string;
}

/** What the panel asks the dev server, over the channel Vite already keeps
 *  open to every module it serves. */
export interface Asks {
  'kroma:i18n:editors': { editors: Array<{ id: string; name: string }> };
  'kroma:i18n:where': { line: number | null };
  'kroma:i18n:open': { opened: boolean };
  'kroma:i18n:message': { message: CatalogMessage | null; refused: string | null };
  'kroma:i18n:edit': { written: string[]; refused: string | null };
  'kroma:i18n:status': { status: TranslationStatus | null; refused: string | null };
  'kroma:i18n:confirm': { settled: string[]; refused: string | null };
  'kroma:i18n:lingua': { lingua: Lingua | null };
}

/** The dev server's end of that channel: `import.meta.hot`, narrowed to what
 *  is used. Handed in rather than read here, because a module only ever has
 *  its own. */
export interface Channel {
  send(event: string, data: unknown): void;
  on(event: string, run: (answer: unknown) => void): void;
}

const REFRESH = 'kroma:i18n:refresh';
const SAVED = 'kroma:catalog';
const EVENTS = [
  'kroma:i18n:editors',
  'kroma:i18n:where',
  'kroma:i18n:open',
  'kroma:i18n:message',
  'kroma:i18n:edit',
  'kroma:i18n:status',
  'kroma:i18n:confirm',
  'kroma:i18n:lingua',
] as const satisfies ReadonlyArray<keyof Asks>;
const TIMEOUT_MS = 3000;

const waiting = new Map<number, (answer: unknown) => void>();
const saved = new Set<() => void>();
let channel: Channel | null = null;
let next = 0;

/** Give the panel the dev server to talk to, or `null` where there is none -
 *  a built shell, or a test. */
export function openChannel(hot: Channel | null): void {
  channel = hot;
  if (!hot) return;
  hot.on(SAVED, () => {
    for (const listener of saved) listener();
  });
  for (const event of EVENTS) {
    hot.on(event, (answer) => {
      const { at } = answer as { at: number };
      waiting.get(at)?.(answer);
      waiting.delete(at);
    });
  }
}

/**
 * Ask the dev server for a fresh render of every message on the page.
 *
 * For an engine whose messages are standalone functions there is nothing to
 * subscribe to, so no switch the panel throws asks React for anything. The dev
 * server can: re-running the module the messages come from sends its importers
 * a hot update, and React Refresh re-renders them with their state intact,
 * which a reload would not. Nothing to hear back, and nothing outside a dev
 * server. See `reloadModule` in the Vite plugin.
 */
export function refresh(): void {
  channel?.send(REFRESH, {});
}

/**
 * Call `listener` each time the dev server says a catalog file was saved,
 * whoever saved it: the editor, a hand in the file, the command line. That is
 * the event KROMA's catalogs plugin sends in place of a reload, so an app on
 * another engine never hears it. Returns a disposer.
 */
export function onCatalogSaved(listener: () => void): () => void {
  saved.add(listener);
  return () => {
    saved.delete(listener);
  };
}

/**
 * Ask the dev server something, and hear back.
 *
 * Vite's own channel rather than a route of ours: it is the one a plugin and
 * the modules it injects already share, so there is no endpoint to serve and
 * none for a page the operator is merely visiting to reach.
 */
export function ask<K extends keyof Asks>(event: K, payload: object): Promise<Asks[K] | null> {
  const hot = channel;
  if (!hot) return Promise.resolve(null);
  const at = next++;
  return new Promise((answer) => {
    waiting.set(at, answer as (value: unknown) => void);
    hot.send(event, { ...payload, at });
    setTimeout(() => {
      if (waiting.delete(at)) answer(null);
    }, TIMEOUT_MS);
  });
}
