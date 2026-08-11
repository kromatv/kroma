// Shared visual meta for the element-centric pipeline dashboard: status / kind
// color maps + the poster gradient fallback. Pure data (no JSX, no i18n) so the
// row and drawer can share it; labels come from the i18n catalog in the
// components.

import { color } from '@kroma/ui/kit';

export type Meta = { color: string; bg: string; ring: string; dot: string; pulse?: boolean };
export type KindMeta = { color: string; bg: string; typeKey: 'movie' | 'show' | 'episode' };

/** Compact duration label from milliseconds ("1 h 42" / "42 min"; empty if none). */
export function fmtDur(ms?: number | null): string {
  if (!ms) return '';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

const PENDING: Meta = {
  color: color('text/55'),
  bg: color('white/5'),
  ring: color('white/12'),
  dot: color('text/40'),
};

const STATUS_META: Record<string, Meta> = {
  done: {
    color: color('success'),
    bg: color('success/13'),
    ring: color('success/40'),
    dot: color('success'),
  },
  running: {
    color: color('accent'),
    bg: color('accentWash/15'),
    ring: color('accentWash/50'),
    dot: color('accent'),
    pulse: true,
  },
  failed: {
    color: color('danger'),
    bg: color('danger/13'),
    ring: color('danger/45'),
    dot: color('danger'),
  },
  pending: PENDING,
  missing: PENDING,
};
export const statusMeta = (s: string): Meta => STATUS_META[s] ?? PENDING;

const OVERALL_PENDING: Meta = {
  ...PENDING,
  color: color('text/70'),
  bg: color('white/6'),
  dot: color('text/45'),
};
const OVERALL_META: Record<string, Meta> = {
  ok: {
    color: color('success'),
    bg: color('success/13'),
    ring: color('success/40'),
    dot: color('success'),
  },
  running: {
    color: color('accent'),
    bg: color('accentWash/14'),
    ring: color('accentWash/50'),
    dot: color('accent'),
    pulse: true,
  },
  pending: OVERALL_PENDING,
  failed: {
    color: color('danger'),
    bg: color('danger/13'),
    ring: color('danger/45'),
    dot: color('danger'),
  },
};
export const overallMeta = (s: string): Meta => OVERALL_META[s] ?? OVERALL_PENDING;

const FILM_KIND: KindMeta = {
  color: color('accent'),
  bg: color('accentWash/14'),
  typeKey: 'movie',
};
const KIND_META: Record<string, KindMeta> = {
  film: FILM_KIND,
  series: { color: color('hdr'), bg: color('hdr/14'), typeKey: 'show' },
  episode: { color: color('info'), bg: color('info/14'), typeKey: 'episode' },
};
export const kindMeta = (k: string): KindMeta => KIND_META[k] ?? FILM_KIND;

/** Deterministic poster gradient from a seed (shown behind / until a real poster
 *  loads). The shared helper, so the pipeline rows and the dashboard compute the
 *  SAME hue for the same title. */
export { posterGradient as posterGrad } from '#web/shared/lib/adminFormat';
