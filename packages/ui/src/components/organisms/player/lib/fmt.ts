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
// instead. Gamma 3 is the default: the midpoint sits at ~0.125 amplitude.
export const VOLUME_GAMMA = 3;

/** Where full volume sits on a rail that reaches past it: the last quarter is
 *  the boost, linear from 100% to `max`. A rail whose max is 1 ends there. */
export const UNITY_POS = 0.75;

function unityPos(max: number): number {
  return max > 1 ? UNITY_POS : 1;
}

/** Slider position [0,1] → audio volume [0,max]: perceptual up to 1, then a
 *  linear boost. `max` is the controller's `volumeMax`, 1 without a boost. */
export function sliderToVolume(position: number, max = 1): number {
  const p = clamp01(position);
  const unity = unityPos(max);
  if (p <= unity) return (p / unity) ** VOLUME_GAMMA;
  return 1 + ((p - unity) / (1 - unity)) * (max - 1);
}

/** Audio volume [0,max] → slider position [0,1] (inverse of {@link sliderToVolume}). */
export function volumeToSlider(volume: number, max = 1): number {
  const unity = unityPos(max);
  const v = Math.max(0, Math.min(max, volume));
  if (v <= 1) return clamp01(v) ** (1 / VOLUME_GAMMA) * unity;
  return unity + ((v - 1) / (max - 1)) * (1 - unity);
}

/** One 5% step of real volume, clamped to [0,max]. */
export function volumeStep(volume: number, dir: -1 | 1, max = 1): number {
  return Math.max(0, Math.min(max, Math.round((volume + dir * 0.05) * 100) / 100));
}
