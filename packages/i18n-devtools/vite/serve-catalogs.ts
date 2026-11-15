import type { ViteDevServer } from 'vite';
import type { CatalogEvent } from './answer.ts';

const EVENTS: readonly CatalogEvent[] = [
  'kroma:i18n:message',
  'kroma:i18n:edit',
  'kroma:i18n:status',
  'kroma:i18n:confirm',
];

/**
 * Answer what the page asks of the catalogs on disk: a message to edit, an
 * edit to write, how a locale stands, a translation to confirm.
 *
 * What answers is loaded on the first ask. It reads the whole workspace, and a
 * shell nobody opens the tools in has no reason to pay for that at startup, or
 * to fail to start because of it.
 */
export function serveCatalogs(server: ViteDevServer): void {
  for (const event of EVENTS) {
    server.environments.client.hot.on(event, (ask: unknown, client) => {
      void import('./answer.ts')
        .then(({ answer }) => {
          const said = answer(event, ask);
          if (said) {
            client.send(event, said);
          }
        })
        .catch((error: unknown) => {
          server.config.logger.warn(`[i18n] cannot reach the catalogs: ${String(error)}`);
        });
    });
  }
}
