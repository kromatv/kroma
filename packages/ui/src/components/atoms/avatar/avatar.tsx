// <Avatar>: the profile / cast disc. A photo when there is one, otherwise a
// deterministic gradient with the person's initials, so a profile is never a
// blank circle and always keeps the same colour everywhere it appears.

import { hashString } from '@kroma/core';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { type CornerValue, styles, useTheme } from '#ui/core';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #F4B642, #E8743B)',
  'linear-gradient(135deg, #3BC9DB, #3B82F6)',
  'linear-gradient(135deg, #A855F7, #6366F1)',
  'linear-gradient(135deg, #F472B6, #EC4899)',
  'linear-gradient(135deg, #34D399, #10B981)',
] as const;

const AVATAR_GRADIENT = AVATAR_GRADIENTS[0];

/** Stable gradient for a seed (a user id, a person's name), so a profile keeps
 * its colour on every screen and on every device. */
function gradientFor(seed: string): string {
  return AVATAR_GRADIENTS[hashString(seed) % AVATAR_GRADIENTS.length] as string;
}

/** One or two letters for the fallback: the first and last name's initials, or
 * the first two characters of a single-word name.
 *
 * Splits on punctuation as well as whitespace, because a display name is very
 * often a username: "jean.dupont" and "ada_lovelace" should read JD and AL, not
 * JE and AD. */
function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts.at(-1) ?? first;
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

interface AvatarProps {
  name?: string;
  /** Photo URL. Falls back to the initials on error or when absent. */
  src?: string | null;
  size?: number;
  /** Seed for the deterministic gradient. Defaults to `name`. */
  seed?: string;
  /** Override the gradient outright (the cast row cycles by position). */
  gradient?: string;
  /**
   * How round the corner is, as a FRACTION of the size: 0 is a square, 0.5 is a
   * circle, and the default 0.16 is the design's rounded square.
   *
   * A ratio rather than pixels, because everything else about an avatar already
   * scales with `size` - the initials, the padlock, the icon inside it - and a
   * fixed 24px corner does not: it reads as a squircle at 48 and as a barely
   * softened box at 200, so the same profile changes shape between the list row
   * and the picker. One `roundness` looks the same at every size.
   */
  roundness?: number;
  /** A full circle: the profile picker's disc and the cast row. The same as
   *  `roundness={0.5}`, spelled the way the design speaks about it. */
  circle?: boolean;
  /** Amber padlock badge for a PIN-protected profile. */
  locked?: boolean;
  /** Drop shadow. On by default: a profile disc floats above the backdrop. */
  shadow?: boolean;
}

/** The design's rounded square, as a FRACTION of the side. Exported because a
 *  tile that sits in a row of avatars has to match their corner exactly, and a
 *  copied `0.16` in the other component is how the two drift apart. */
const AVATAR_ROUNDNESS = 0.16;
const ROUNDNESS = AVATAR_ROUNDNESS;

// A circle is the roundest a square can be, half its own side; `roundness` is
// capped here rather than letting a value past it draw a shape no platform
// agrees on.
const CIRCLE = 0.5;

// Keeps the badge inside the arc of a corner of radius `corner`: a badge
// inset `i` stays within it while `i >= corner * (1 - 1/√2)` (~0.293 of the
// radius). The floor keeps a little air between the badge and a square-ish
// corner.
function badgeInset(size: number, corner: number): number {
  return Math.round(Math.max(size * 0.08, corner * 0.2929));
}

function Avatar({
  name = '',
  src = null,
  size = 64,
  seed,
  gradient,
  roundness = ROUNDNESS,
  circle = false,
  locked = false,
  shadow = true,
}: Readonly<AvatarProps>) {
  const { fonts } = useTheme();
  // Clamped, and a non-finite value falls back on the design's default: a corner
  // of NaN renders a square on the web and throws on Android.
  const asked = Number.isFinite(roundness) ? roundness : ROUNDNESS;
  const ratio = circle ? CIRCLE : Math.min(Math.max(asked, 0), CIRCLE);
  // Rounded, so the corner lands on a whole pixel: a 0.16 corner on a 45px
  // avatar is 7.2px, and a half-pixel arc is where a rounded box looks soft on
  // one side and crisp on the other.
  const corner = Math.round(size * ratio);
  // A full disc is GEOMETRY: said in those terms, no theme can square it.
  const shape: CornerValue = circle || ratio === CIRCLE ? 'circle' : corner;
  const fill = gradient ?? gradientFor(seed ?? name);
  const badge = Math.max(24, size * 0.2);
  const inset = badgeInset(size, corner);
  // The initials stand in whenever the photo is not on screen: no src at all,
  // still loading, or a stored URL that 404s - a profile is never a blank disc.
  const initials = (
    <Box fill center>
      <Text
        style={{
          fontFamily: fonts.display,
          fontWeight: '700',
          fontSize: Math.round(size * 0.38),
          lineHeight: Math.round(size * 0.46),
          color: 'rgba(255, 255, 255, 0.95)',
        }}
      >
        {initialsOf(name)}
      </Text>
    </Box>
  );
  return (
    // No `overflow="hidden"`: `Img` already clips the art to `corner` itself, and
    // clipping HERE cropped the padlock badge against the disc's own corner - the
    // rounder the avatar, the more of the badge the arc cut away.
    <Box w={size} h={size} radius={shape} center style={shadow ? s.shadow : null}>
      <Img
        src={src}
        background={fill}
        radius={shape}
        fill
        alt={name}
        placeholder={initials}
        fallback={initials}
      />
      {locked ? (
        <Box
          absolute
          right={inset}
          bottom={inset}
          w={badge}
          h={badge}
          center
          radius="circle"
          bg="bg/80"
        >
          <Icon name="lock" size={Math.max(14, size * 0.11)} color="accentText" />
        </Box>
      ) : null}
    </Box>
  );
}

const s = styles({ shadow: { boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)' } });

export type { AvatarProps };
export { AVATAR_GRADIENT, AVATAR_GRADIENTS, AVATAR_ROUNDNESS, Avatar, gradientFor, initialsOf };
