/** Player-chrome formatting helpers shared by web + TV. */

import { clamp01 } from '#ui/components/atoms/progress';

/**
 * Wall-clock time the current playback will finish, given the remaining
 * milliseconds (§1, "fin à 22h38"). Localized: 24h `22h38` for fr, `10:38 PM`
 * for en. Empty string when the runtime is unknown.
 */
export function endsAtClock(remainingMs: number | null | undefined, locale?: string): string {
  if (!remainingMs || remainingMs <= 0) return '';
  const d = new Date(Date.now() + remainingMs);
  if (locale === 'en') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return `${d.getHours()}h${d.getMinutes().toString().padStart(2, '0')}`;
}

/** The kit's one clamp (the progress atom's), re-exported for the chrome. */
export { clamp01 };

/** Percentage (0–100) of `value` within `total`, clamped and safe when total=0. */
export function pct(value: number, total: number): number {
  return total > 0 ? clamp01(value / total) * 100 : 0;
}

/** Slider position [0,1] → level [0,max]. The rail is linear in the level a
 *  viewer reads (50% sits halfway to 100%); the platform applies the loudness
 *  curve when it drives the audio (see the web's useVolumeBoost). `max` is the
 *  controller's `volumeMax`, 1 without a boost. */
export function sliderToVolume(position: number, max = 1): number {
  return clamp01(position) * max;
}

/** Level [0,max] → slider position [0,1] (inverse of {@link sliderToVolume}). */
export function volumeToSlider(volume: number, max = 1): number {
  return clamp01(volume / max);
}

/** One 5% step of level, clamped to [0,max]. */
export function volumeStep(volume: number, dir: -1 | 1, max = 1): number {
  return Math.max(0, Math.min(max, Math.round((volume + dir * 0.05) * 100) / 100));
}
