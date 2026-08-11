// One row of the app's navigation. The router owns the active state and the
// anchor owns the pointer, so the row inside them is the only part the kit's
// vocabulary can paint.

import { Box, type ColorValue, color, Text } from '@kroma/ui/kit';
import type { TablerIcon } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { type CSSProperties, useState } from 'react';

const LINK: CSSProperties = { display: 'block', color: 'inherit', textDecoration: 'none' };

export interface NavRowProps {
  glyph: TablerIcon;
  label: string;
  active?: boolean;
  hovered?: boolean;
  /** A destination the viewer cannot reach: the row reads as unavailable rather
   *  than missing, so the sidebar keeps its shape. */
  dim?: boolean;
}

/** The row's face, for a destination that is not a link. */
export function NavRow({ glyph: Glyph, label, active, hovered, dim }: Readonly<NavRowProps>) {
  let ink: ColorValue = 'textMuted';
  if (active) ink = 'accent';
  else if (hovered) ink = 'text';
  let fill: ColorValue | undefined;
  if (active) fill = 'accentSoft';
  else if (hovered) fill = 'white/4';
  return (
    <Box row align="center" gap={14} px={14} py={12} radius="md" bg={fill} opacity={dim ? 0.5 : 1}>
      <Glyph size={18} color={color(ink)} />
      <Text variant="label" color={ink}>
        {label}
      </Text>
    </Box>
  );
}

export interface NavItemProps {
  to: string;
  /** Whether only the exact path counts as active, rather than any child of it. */
  exact?: boolean;
  glyph: TablerIcon;
  label: string;
}

/** One navigation destination. */
export function NavItem({ to, exact, glyph, label }: Readonly<NavItemProps>) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={to}
      activeOptions={{ exact: exact ?? false }}
      style={LINK}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {({ isActive }) => <NavRow glyph={glyph} label={label} active={isActive} hovered={hovered} />}
    </Link>
  );
}
