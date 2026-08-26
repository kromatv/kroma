import { Box, Focusable, Text } from '@kroma/ui/kit';
import type { TablerIcon } from '@tabler/icons-react';
import { useMatchRoute } from '@tanstack/react-router';
import { createContext, type ReactNode, useContext } from 'react';
import { useNavActions } from '#web/shared/ui/nav-actions';
import { RouteLink } from '#web/shared/ui/route-link';
import {
  SIDE_NAV_BAND_X,
  SIDE_NAV_GLYPH,
  SIDE_NAV_GUTTER,
  SIDE_NAV_SAFE_BOTTOM,
  sideNavRow,
} from '#web/shared/ui/side-nav-style';

type RowSlots = ReturnType<typeof sideNavRow>;

const RowContext = createContext<RowSlots | null>(null);

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

function Root({ children }: Readonly<SideNavRootProps>) {
  return (
    <Box role="navigation" flex minH={0} px={SIDE_NAV_GUTTER} pt={4}>
      {children}
    </Box>
  );
}

interface SideNavGroupProps {
  label: string;
  children: ReactNode;
}

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
  exact?: boolean;
  icon: TablerIcon;
  disabled?: boolean;
  children: ReactNode;
}

function Item({
  to,
  exact = false,
  icon: Glyph,
  disabled = false,
  children,
}: Readonly<SideNavItemProps>) {
  const matchRoute = useMatchRoute();
  const current = matchRoute({ to, fuzzy: !exact }) !== false;
  return (
    <Focusable
      sv={sideNavRow}
      vars={{ current }}
      current={current ? 'page' : undefined}
      disabled={disabled}
      as={<RouteLink to={to} />}
    >
      {({ slots }) => (
        <RowContext.Provider value={slots}>
          <Glyph size={SIDE_NAV_GLYPH} stroke={1.7} color={slots.glyph.color} />
          {children}
        </RowContext.Provider>
      )}
    </Focusable>
  );
}

function Label({ children }: Readonly<{ children: ReactNode }>) {
  const slots = useContext(RowContext);
  return (
    <Text variant="label" lines={1} style={slots?.label}>
      {children}
    </Text>
  );
}

function Trailing({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box row align="center" gap={6} shrink={0} ml="auto">
      {children}
    </Box>
  );
}

function Footer({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box mt="auto" pt={24} style={SIDE_NAV_SAFE_BOTTOM}>
      {children}
    </Box>
  );
}

const SideNav = { Header, Root, Group, Item, Label, Trailing, Footer };

export { SideNav };
