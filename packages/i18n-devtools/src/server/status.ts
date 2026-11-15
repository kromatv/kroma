import { engine } from '../engine/engine';
import type { MessageTarget } from '../overlay/message-target';
import { holdStatus, wantStatus } from '../overlay/review';
import { ask } from './host';

/**
 * Ask the dev server how `locale` stands and keep the answer for the panel and
 * the overlay. Nothing is asked for an engine that is not `writable`, whose
 * catalogs the dev server does not know, and nothing is kept where it refuses.
 */
export async function loadStatus(locale: string): Promise<void> {
  if (!engine().writable || !locale) return wantStatus(null);
  wantStatus(locale);
  const answer = await ask('kroma:i18n:status', { locale });
  if (answer?.status) holdStatus(answer.status);
}

/** Have the dev server record that the translation `target` names holds as it
 *  reads, then read the status again: the count and the grade both moved. */
export async function confirmMessage(target: MessageTarget): Promise<void> {
  const { scope, locale, key } = target;
  const answer = await ask('kroma:i18n:confirm', { scope, locale, key });
  if (answer?.refused) console.warn(`[i18n] could not confirm ${key}: ${answer.refused}`);
  if (answer?.settled.length) await loadStatus(locale);
}
