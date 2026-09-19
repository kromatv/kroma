const STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.345],
  ['month', 12],
];

/**
 * An instant as the reader would say it from `now`: `2 hours ago`, `yesterday`,
 * `in 3 days`. Both arguments are unix seconds.
 */
export function relativeTime(atSeconds: number, nowSeconds: number, locale: string): string {
  let value = atSeconds - nowSeconds;
  let unit: Intl.RelativeTimeFormatUnit = 'year';
  for (const [step, span] of STEPS) {
    if (Math.abs(value) < span) {
      unit = step;
      break;
    }
    value /= span;
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(value), unit);
}
