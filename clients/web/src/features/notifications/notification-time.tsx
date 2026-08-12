import { useLocale, useT } from '@kroma/ui';

/**
 * A formatter for how long ago a row arrived, in the reader's language.
 *
 * A formatter rather than a component: the same words go into a row's
 * accessible name and into the span a folded run reads out, and neither can
 * take a node.
 *
 * `Intl.RelativeTimeFormat` renders the zero case as the CURRENT unit rather
 * than an elapsed one ("this minute"), so it is special-cased to "just now".
 * `short` style is used over `narrow`, which renders French as "-47 min".
 */
export function useRelativeTime(): (at: number) => string {
  const t = useT();
  const locale = useLocale();
  return (at: number) => {
    const mins = Math.max(0, Math.round((Date.now() - at) / 60_000));
    if (mins < 1) return t('notifications.justNow');
    const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    if (mins < 60) return fmt.format(-mins, 'minute');
    const hours = Math.round(mins / 60);
    if (hours < 24) return fmt.format(-hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 7) return fmt.format(-days, 'day');
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at);
  };
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
