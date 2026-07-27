// <StatusDot>: is the thing reachable?
//
// Ten points of colour with a halo of its own light: green when the server
// answers, red when it does not, and a quiet grey while the first probe is
// still in flight - the third state being the point, because "we do not know
// yet" and "it is down" must not look alike on a list you are choosing from.
//
// The halo is what makes a dot this small read as LIT rather than as a stray
// pixel, and `overArt` adds the dark ring the same dot needs when it sits on a
// bright hero still instead of on a surface. That ring was the only difference
// between the TV's two copies of this dot, which is how it ended up here.

import { Box } from '#ui/components/atoms/box';
import { colors } from '#ui/lib/tokens';

interface StatusDotProps {
  /** `true` up, `false` down, `undefined` not probed yet. */
  online?: boolean;
  /** Diameter. The default is the 10-foot size; a phone list wants ~8. */
  size?: number;
  /** Adds a dark ring, for a dot drawn over artwork rather than over a surface. */
  overArt?: boolean;
}

function StatusDot({ online, size = 10, overArt = false }: Readonly<StatusDotProps>) {
  const look = lookOf(online);
  const shadow = [overArt ? ART_RING : null, look.glow].filter(Boolean).join(', ');
  return (
    <Box
      w={size}
      h={size}
      shrink={0}
      radius="pill"
      bg={look.bg}
      style={shadow ? { boxShadow: shadow } : null}
    />
  );
}

function lookOf(online?: boolean) {
  if (online === undefined) return PENDING;
  return online ? UP : DOWN;
}

/** Pending has no glow: nothing is lit until something has answered. */
const PENDING = { bg: 'rgba(255, 255, 255, 0.25)', glow: null };
const UP = { bg: colors.success, glow: '0 0 7px rgba(70, 208, 141, 0.75)' };
const DOWN = { bg: colors.danger, glow: '0 0 7px rgba(229, 57, 53, 0.75)' };

/** The ring that keeps the dot's edge on artwork. */
const ART_RING = '0 0 0 2px rgba(0, 0, 0, 0.4)';

export type { StatusDotProps };
export { StatusDot };
