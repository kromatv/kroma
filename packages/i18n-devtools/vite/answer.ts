import { z } from 'zod';
import { appSets } from './app-sets.ts';
import { editMessage } from './edit.ts';
import { describeMessage } from './message.ts';
import type { Sets } from './sets.ts';
import { confirmMessage, describeStatus } from './status.ts';

const ANSWERS = {
  'kroma:i18n:message': describeMessage,
  'kroma:i18n:edit': editMessage,
  'kroma:i18n:status': describeStatus,
  'kroma:i18n:confirm': confirmMessage,
} as const;

const Asked = z.object({ at: z.number() });

/** What the page asks of the catalogs on disk. */
export type CatalogEvent = keyof typeof ANSWERS;

/** Answer one ask about the catalogs, or `null` for one that carries no `at`
 *  to answer under. `sets` is what the running app renders in this repository
 *  unless a test hands it its own. */
export function answer(event: CatalogEvent, ask: unknown, sets: Sets = appSets): object | null {
  const asked = Asked.safeParse(ask);
  if (!asked.success) {
    return null;
  }
  return { at: asked.data.at, ...ANSWERS[event](sets, ask) };
}
