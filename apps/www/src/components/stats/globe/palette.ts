import { colors, lightColors } from '@kromatv/ui/tokens/colors';
import type { Ground } from '#site/lib/ground';

export interface GlobePalette {
  sphere: string;
  dots: string;
  pin: string;
}

// How far past the deepest surface the light ball goes: a touch of ink, so it
// reads as an object against the page while staying a light grey; the drop
// shadow does the rest of the separating.
const PAPER_SHADE = 0.04;

function channel(hex: string, at: number): number {
  return Number.parseInt(hex.slice(at, at + 2), 16);
}

/** `from` moved `amount` of the way toward `to`, both `#rrggbb`. */
export function mix(from: string, to: string, amount: number): string {
  const blend = (at: number) =>
    Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${blend(1)}${blend(3)}${blend(5)}`;
}

/**
 * The globe in the page's own tokens: the ball is the deepest raised surface,
 * shaded further on paper, the land is the text ink, and a pin is the accent
 * wash, which clears both grounds.
 */
export function globePalette(ground: Ground): GlobePalette {
  if (ground === 'light') {
    return {
      sphere: mix(lightColors.surface3, lightColors.tint, PAPER_SHADE),
      dots: lightColors.text,
      pin: lightColors.accentWash,
    };
  }
  return { sphere: colors.surface3, dots: colors.text, pin: colors.accentWash };
}
