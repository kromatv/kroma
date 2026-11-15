import { engine } from '../engine/engine';
import { renderedLocale } from '../engine/rendered-locale';
import type { Probe } from './probe';

/** One message of one locale, as the dev server is asked about it: its key,
 *  the scope whose catalogs hold it, `null` for the app's own, and the locale
 *  to write. */
export interface MessageTarget {
  readonly scope: string | null;
  readonly locale: string;
  readonly key: string;
}

/**
 * What the editor would open on for `probe`, or `null` where there is nothing
 * to offer: no string under the pointer, one that has no key, or an engine
 * that does not declare itself `writable`. The locale is the one being
 * rendered, which is not the one that answered where a message fell back.
 */
export function editTarget(probe: Probe | null): MessageTarget | null {
  const locale = renderedLocale();
  if (!probe?.key || !locale || !engine().writable) return null;
  return { scope: probe.scope, locale, key: probe.key };
}

/** The translation a confirm would vouch for: the one under the pointer, where
 *  it is graded `outdated` or `unreviewed`, and `null` otherwise. */
export function confirmTarget(probe: Probe | null): MessageTarget | null {
  if (probe?.grade !== 'outdated' && probe?.grade !== 'unreviewed') return null;
  return editTarget(probe);
}
