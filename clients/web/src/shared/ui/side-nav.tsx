import { Box, Text } from '@kroma/ui/kit';
import type { TablerIcon } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useNavActions } from '#web/shared/ui/nav-actions';
import {
  SIDE_NAV_BAND_X,
  SIDE_NAV_COLUMN,
  SIDE_NAV_GLYPH,
  SIDE_NAV_GUTTER,
  SIDE_NAV_LABEL,
  SIDE_NAV_ROW,
  SIDE_NAV_SAFE_BOTTOM,
  SIDE_NAV_TRAILING,
} from '#web/shared/ui/side-nav-style';

/** The band over the column: the shell's mark, and the controls the app pins to
 *  every navigation (`NavActionsProvider`). */
function Header({ children }: Readonly<{ children: ReactNode }>) {
  const actions = useNavActions();
  return (
    <Box shrink={0} row align="center" between gap={8} px={SIDE_NAV_BAND_X} pt={24} pb={16}>
      {children}
      {actions}
    </Box>
  );
}

interface SideNavRootProps {
  children: ReactNode;
}

/** The app's side navigation, the catalogue's and the console's alike: the
 *  landmark, the column and the rhythm the rows sit on. The scrolling frame
 *  around it belongs to the aside or to the sheet it is written in. */
function Root({ children }: Readonly<SideNavRootProps>) {
  return <nav style={SIDE_NAV_COLUMN}>{children}</nav>;
}

interface SideNavGroupProps {
  /** The heading over the group, already translated. */
  label: string;
  children: ReactNode;
}

/** A named run of destinations. */
function Group({ label, children }: Readonly<SideNavGroupProps>) {
  return (
    <Box pt={18}>
      <Text variant="overline" color="textDim" px={SIDE_NAV_GUTTER} pb={6}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

interface SideNavItemProps {
  to: string;
  /** Whether only the exact path reads as the current page, rather than any
   *  child of it. */
  exact?: boolean;
  icon: TablerIcon;
  /** A destination the viewer cannot reach: the row keeps its place and reads
   *  as unavailable rather than going missing, and leads nowhere. */
  dim?: boolean;
  children: ReactNode;
}

/** One destination. The WHOLE row is the link: one pointer target, and the
 *  glyph, the name and the tail take the row's ink rather than each carrying
 *  their own. */
function Item({
  to,
  exact = false,
  icon: Glyph,
  dim = false,
  children,
}: Readonly<SideNavItemProps>) {
  const glyph = <Glyph size={SIDE_NAV_GLYPH} stroke={1.7} />;
  if (dim) {
    return (
      <div className={SIDE_NAV_ROW} aria-disabled="true">
        {glyph}
        {children}
      </div>
    );
  }
  return (
    <Link to={to} className={SIDE_NAV_ROW} activeOptions={{ exact }}>
      {glyph}
      {children}
    </Link>
  );
}

/** A row's name. Written first, it is what the row is called. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  return <span style={SIDE_NAV_LABEL}>{children}</span>;
}

/** The tail of a row: a count, a badge, a dot. The row is the one target, so
 *  what sits here is a face and never a control. */
function Trailing({ children }: Readonly<{ children: ReactNode }>) {
  return <span style={SIDE_NAV_TRAILING}>{children}</span>;
}

/** What the column pins to its bottom edge: this device's codecs, the server's
 *  status. It scrolls with the column rather than clipping when the window is
 *  too short for both. */
function Footer({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box mt="auto" pt={24} style={SIDE_NAV_SAFE_BOTTOM}>
      {children}
    </Box>
  );
}

const SideNav = { Header, Root, Group, Item, Label, Trailing, Footer };

export { SideNav };
