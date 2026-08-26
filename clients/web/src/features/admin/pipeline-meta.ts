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
