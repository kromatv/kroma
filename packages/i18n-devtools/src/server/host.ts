/** What the panel asks the dev server, over the channel Vite already keeps
 *  open to every module it serves. */
export interface Asks {
  'kroma:i18n:editors': { editors: Array<{ id: string; name: string }> };
  'kroma:i18n:where': { line: number | null };
  'kroma:i18n:open': { opened: boolean };
}

/** The dev server's end of that channel: `import.meta.hot`, narrowed to what
 *  is used. Handed in rather than read here, because a module only ever has
 *  its own. */
export interface Channel {
  send(event: string, data: unknown): void;
  on(event: string, run: (answer: unknown) => void): void;
}

const REFRESH = 'kroma:i18n:refresh';
const EVENTS = ['kroma:i18n:editors', 'kroma:i18n:where', 'kroma:i18n:open'] as const;
const TIMEOUT_MS = 3000;

const waiting = new Map<number, (answer: unknown) => void>();
let channel: Channel | null = null;
let next = 0;

/** Give the panel the dev server to talk to, or `null` where there is none -
 *  a built shell, or a test. */
export function openChannel(hot: Channel | null): void {
  channel = hot;
  if (!hot) return;
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
