// Reachability dot: green up, red down, grey while the first probe is in flight.
// The third state matters — "not known yet" must not look like "down".

import { Box } from '#ui/components/atoms/box';
import { colors } from '#ui/lib/tokens';

interface StatusDotProps {
  /** `undefined` means not probed yet. */
  online?: boolean;
  size?: number;
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

const PENDING = { bg: 'rgba(255, 255, 255, 0.25)', glow: null };
const UP = { bg: colors.success, glow: '0 0 7px rgba(70, 208, 141, 0.75)' };
const DOWN = { bg: colors.danger, glow: '0 0 7px rgba(229, 57, 53, 0.75)' };

const ART_RING = '0 0 0 2px rgba(0, 0, 0, 0.4)';

export type { StatusDotProps };
export { StatusDot };
