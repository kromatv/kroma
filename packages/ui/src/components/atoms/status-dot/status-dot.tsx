import {
  activeTheme,
  type ColorValue,
  color,
  type StyleScope,
  sharedStyle,
  useStyleScope,
} from '#ui/core';
// Reachability dot: green up, red down, grey while the first probe is in flight.
// The third state matters: "not known yet" must not look like "down".

import { Box } from '#ui/components/atoms/box';

/** What one status reads as: the dot's fill and its optional halo. */
interface Look {
  bg: ColorValue;
  glow: string | null;
}

interface StatusDotProps {
  /** `undefined` means not probed yet. */
  online?: boolean;
  size?: number;
  overArt?: boolean;
}

function StatusDot({ online, size = 10, overArt = false }: Readonly<StatusDotProps>) {
  const scope = useStyleScope();

  const look = lookOf(online, scope);
  const shadow = [overArt ? ART_RING : null, look.glow].filter(Boolean).join(', ');
  return (
    <Box
      w={size}
      h={size}
      shrink={0}
      radius="circle"
      bg={look.bg}
      style={shadow ? sharedStyle(`status-dot:glow:${shadow}`, { boxShadow: shadow }, scope) : null}
    />
  );
}

function lookOf(online: boolean | undefined, scope: StyleScope): Look {
  if (online === undefined) return PENDING;
  const token = online ? 'success' : 'danger';
  const halo = color(`${token}/75`, activeTheme(scope.theme));
  return { bg: token, glow: `0 0 7px ${halo}` };
}

const PENDING: Look = { bg: 'tint/25', glow: null };

const ART_RING = `0 0 0 2px ${color('black/40')}`;

export type { StatusDotProps };
export { StatusDot };
