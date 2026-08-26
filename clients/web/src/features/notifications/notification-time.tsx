// How a notification row says when it arrived.
//
// The elapsed wording is the shared one from @kroma/core, so the panel and the
// admin console count time the same way. It comes back lowercase, because it
// also goes inside "De {first} à {last}"; the row sentence-cases it where it
// stands on its own.

import { sentenceCase } from '@kroma/core';
import { useFormat, useLocale } from '@kroma/ui';

/** A formatter for how long ago a row arrived, in the reader's language.
 *
 * A formatter rather than a component: the same words go into a row's
 * accessible name and into the span a folded run reads out, and neither can
 * take a node.
 */
export function useRelativeTime(): (at: number) => string {
  const fmt = useFormat();
  return (at: number) => fmt.elapsed(at);
}

/** The same label, capitalised, for where it stands alone rather than inside a
 * sentence. */
export function useStandaloneTime(): (at: number) => string {
  const relative = useRelativeTime();
  const locale = useLocale();
  return (at: number) => sentenceCase(relative(at), locale);
}

/**
 * A formatter for the wall clock a row arrived at, dropping the date for
 * anything from today.
 *
 * The occurrences folded under a repeated event are told apart by their time
 * and nothing else, and eleven of them all reading "7 min ago" says nothing.
 */
export function useExactTime(): (at: number) => string {
  const locale = useLocale();
  const today = new Date().toDateString();
  return (at: number) => {
    const clock = { hour: '2-digit', minute: '2-digit' } as const;
    const sameDay = new Date(at).toDateString() === today;
    const shape = sameDay ? clock : { day: 'numeric' as const, month: 'short' as const, ...clock };
    return new Intl.DateTimeFormat(locale, shape).format(at);
  };
}
