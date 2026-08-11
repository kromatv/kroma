// Shared visual meta for the element-centric pipeline dashboard: status / kind
// color maps + the poster gradient fallback. Pure data (no JSX, no i18n) so the
// row and drawer can share it; labels come from the i18n catalog in the
// components.

import type { ColorValue } from '@kroma/ui/kit';

export type Meta = {
  color: ColorValue;
  bg: ColorValue;
  ring: ColorValue;
  dot: ColorValue;
  pulse?: boolean;
};
export type KindMeta = { color: ColorValue; bg: ColorValue; typeKey: 'movie' | 'show' | 'episode' };

/** Compact duration label from milliseconds ("1 h 42" / "42 min"; empty if none). */
export function fmtDur(ms?: number | null): string {
  if (!ms) return '';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

const PENDING: Meta = {
  color: 'text/55',
  bg: 'tint/5',
  ring: 'tint/12',
  dot: 'text/40',
};

const STATUS_META: Record<string, Meta> = {
  done: { color: 'success', bg: 'success/13', ring: 'success/40', dot: 'success' },
  running: {
    color: 'accent',
    bg: 'accentWash/15',
    ring: 'accentWash/50',
    dot: 'accent',
    pulse: true,
  },
  failed: { color: 'danger', bg: 'danger/13', ring: 'danger/45', dot: 'danger' },
  pending: PENDING,
  missing: PENDING,
};
export const statusMeta = (s: string): Meta => STATUS_META[s] ?? PENDING;

const OVERALL_PENDING: Meta = {
  ...PENDING,
  color: 'text/70',
  bg: 'tint/6',
  dot: 'text/45',
};
const OVERALL_META: Record<string, Meta> = {
  ok: { color: 'success', bg: 'success/13', ring: 'success/40', dot: 'success' },
  running: {
    color: 'accent',
    bg: 'accentWash/14',
    ring: 'accentWash/50',
    dot: 'accent',
    pulse: true,
  },
  pending: OVERALL_PENDING,
  failed: { color: 'danger', bg: 'danger/13', ring: 'danger/45', dot: 'danger' },
};
export const overallMeta = (s: string): Meta => OVERALL_META[s] ?? OVERALL_PENDING;

const FILM_KIND: KindMeta = { color: 'accent', bg: 'accentWash/14', typeKey: 'movie' };
const KIND_META: Record<string, KindMeta> = {
  film: FILM_KIND,
  series: { color: 'hdr', bg: 'hdr/14', typeKey: 'show' },
  episode: { color: 'info', bg: 'info/14', typeKey: 'episode' },
};
export const kindMeta = (k: string): KindMeta => KIND_META[k] ?? FILM_KIND;

/** Deterministic poster gradient from a seed (shown behind / until a real poster
 *  loads). The shared helper, so the pipeline rows and the dashboard compute the
 *  SAME hue for the same title. */
export { posterGradient as posterGrad } from '#web/shared/lib/adminFormat';
