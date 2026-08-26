// The kit's binding of @kroma/core's value formatters to the active locale, so
// a screen never has to carry one around. Lives here rather than in core
// because this is where the locale context is, and it is what every shell and
// every module already reaches for when it wants `useT`.
//
// Standing alone rather than throwing outside an <I18nProvider>: five of these
// never touch a catalog, and a byte size is exactly what a kit component or an
// error boundary rendered above the provider wants to show. The other three
// read one, so above a provider they answer in the default locale, the same
// fallback `useTDefault` documents. That is the whole contract, and the test
// beside this file holds it in place.

import {
  decimal,
  formatBytes,
  formatDuration,
  formatElapsed,
  formatHours,
  formatMbps,
  formatTimecodeMs,
  formatUptime,
} from '@kroma/core';
import type { Locale, Translate } from '@kroma/i18n';
import { useLocaleDefault, useTDefault } from './i18n';

export interface Format {
  /** A byte size in the locale's units: `1,5 Go` / `1.5 GB`. */
  bytes: (bytes: number) => string;
  /** A fixed-point number with the locale's separator. One decimal by default. */
  decimal: (n: number, digits?: number) => string;
  /** How long ago a timestamp was, in words, from an ISO string or epoch
   *  milliseconds. Null reads as "never". */
  elapsed: (at: string | number | null | undefined) => string;
  /** Uptime at the coarsest useful scale, from seconds. */
  uptime: (seconds: number) => string;
  /** Watch time to the minute, from milliseconds. */
  duration: (ms: number) => string;
  /** Hours with one decimal for a chart axis, from milliseconds. */
  hours: (ms: number) => string;
  /** A throughput figure, one decimal, no unit. */
  mbps: (n: number) => string;
  /** A scrub-bar timecode, from milliseconds. */
  timecode: (ms: number) => string;
}

// One set per locale for the whole app, not one per mounted component: these
// are called from table cells and download rows, where fifty of them would mean
// fifty identical objects and four hundred identical closures.
const BOUND = new Map<Locale, Format>();

function formatFor(locale: Locale, t: Translate): Format {
  const cached = BOUND.get(locale);
  if (cached) return cached;
  const bound: Format = {
    bytes: (bytes) => formatBytes(bytes, locale),
    decimal: (n, digits) => decimal(n, locale, digits),
    elapsed: (at) => formatElapsed(t, locale, at),
    uptime: (seconds) => formatUptime(t, seconds),
    duration: (ms) => formatDuration(t, ms),
    hours: (ms) => formatHours(ms, locale),
    mbps: (n) => formatMbps(n, locale),
    timecode: formatTimecodeMs,
  };
  BOUND.set(locale, bound);
  return bound;
}

/** Every value formatter, bound to the locale on screen. */
export function useFormat(): Format {
  return formatFor(useLocaleDefault(), useTDefault());
}
