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

// Human loudness is roughly logarithmic, so a linear fader barely resolves the
// quiet end; slider position maps to volume through a power curve (gamma)
// instead. Gamma 3 is the default — the midpoint sits at ~0.125 amplitude.
export const VOLUME_GAMMA = 3;

/** Slider position [0,1] → audio volume [0,1] (perceptual). */
export function sliderToVolume(position: number): number {
  return clamp01(position) ** VOLUME_GAMMA;
}

/** Audio volume [0,1] → slider position [0,1] (inverse of {@link sliderToVolume}). */
export function volumeToSlider(volume: number): number {
  return clamp01(volume) ** (1 / VOLUME_GAMMA);
}
