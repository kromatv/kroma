import { hasPermission } from '@kroma/client/accounts';
import type { MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, classes, Drawer, Logo, Row, styles, Text, useBreakpoint } from '@kroma/ui/kit';
import {
  IconAlertTriangle,
  IconBookmark,
  IconCalendarClock,
  IconCategory,
  IconDeviceDesktop,
  IconDeviceTv,
  IconHome,
  IconInbox,
  IconMovie,
  IconSearch,
  IconSettings,
  IconUserPlus,
  type TablerIcon,
} from '@tabler/icons-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { UserChip, VersionInfo } from '#web/features/catalog/sidebar-account';
import { useModuleNav } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { useAuth } from '#web/shared/lib/auth';
import { CapabilityChip } from '#web/shared/ui/capability-chip';
import { useNavActions } from '#web/shared/ui/nav-actions';
import { NavMenuButton } from '#web/shared/ui/nav-menu-button';
import type { RoutePath } from '#web/shared/ui/route-link';
import { SideNav } from '#web/shared/ui/side-nav';
import { SIDE_NAV_FRAME, SIDE_NAV_GUTTER } from '#web/shared/ui/side-nav-style';

// `position: sticky`, `100vh`, `overflow-y` and `env()` have no React Native
// spelling, so the shell's own frames stay CSS around kit content.
const s = styles({
  sidebar: {
    position: 'sticky',
    top: 0,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    borderWidth: 0,
    borderRightWidth: 1,
    borderStyle: 'solid',
    borderRightColor: 'var(--kroma-border)',
    backgroundColor: 'var(--kroma-bg)',
  },
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderStyle: 'solid',
    borderBottomColor: 'var(--kroma-border)',
    backgroundColor: 'color-mix(in srgb, var(--kroma-bg) 95%, transparent)',
    px: 16,
    pb: 10,
    paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  drawerHead: {
    px: SIDE_NAV_GUTTER,
    paddingTop: 'max(1.75rem, env(safe-area-inset-top))',
    pb: 8,
  },
  logoLink: { display: 'block', color: 'inherit', textDecorationLine: 'none' },
  navFill: { bg: 'bg' },
});

// `env()` has no React Native spelling, so the sheet's own insets stay CSS.

const NAV: { labelKey: MessageKey; to: RoutePath; icon: TablerIcon; exact?: boolean }[] = [
  { labelKey: 'nav.home', to: '/', icon: IconHome, exact: true },
  { labelKey: 'nav.search', to: '/search', icon: IconSearch },
  { labelKey: 'nav.films', to: '/movies', icon: IconMovie },
  { labelKey: 'nav.series', to: '/shows', icon: IconDeviceTv },
  { labelKey: 'nav.genres', to: '/genres', icon: IconCategory },
  { labelKey: 'nav.myList', to: '/my-list', icon: IconBookmark },
];

export function Sidebar() {
  const step = useBreakpoint();
  if (step !== 'lg' && step !== 'tv') return null;
  return (
    <aside className={classes(s.sidebar)}>
      <SideNav.Header>
        <Logo size={24} />
      </SideNav.Header>
      <SidebarBody />
    </aside>
  );
}

// The desktop aside's own scroll frame. In the phone sheet the frame is the
// drawer's <Drawer.Panel>, which is why the two are separate.
function SidebarBody() {
  return (
    <ScrollView style={SIDE_NAV_FRAME}>
      <SidebarNav />
    </ScrollView>
  );
}

function SidebarNav() {
  const t = useT();
  return (
    <SideNav.Root>
      {NAV.map((item) => (
        <SideNav.Item key={item.to} to={item.to} exact={item.exact} icon={item.icon}>
          <SideNav.Label>{t(item.labelKey)}</SideNav.Label>
        </SideNav.Item>
      ))}
      <RequestsLink />
      <ComingSoonLink />
      <MissingLink />
      <ModuleNavLinks />
      <SideNav.Footer>
        <InviteLink />
        <SideNav.Item to="/connect" icon={IconDeviceDesktop}>
          <SideNav.Label>{t('nav.connectDevice')}</SideNav.Label>
        </SideNav.Item>
        <AdminLink />
        <UserChip />
        <Box gap={8} px={8} pt={4}>
          <Box row wrap align="center" between gapX={8} gapY={6}>
            <Text variant="overline" color="textDim">
              {t('nav.thisDevice')}
            </Text>
            <CapabilityChip />
          </Box>
          <VersionInfo />
        </Box>
      </SideNav.Footer>
    </SideNav.Root>
  );
}

export function MobileTopbar() {
  const actions = useNavActions();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const step = useBreakpoint();
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run key; pathname closes the drawer on navigation
  useEffect(() => setOpen(false), [pathname]);
  if (step === 'lg' || step === 'tv') return null;
  return (
    <header className={classes(s.topbar)}>
      <Box row align="center" gap={8}>
        <NavMenuButton open={open} onPress={() => setOpen(true)} />
        <Link to="/" aria-label="KROMA" className={classes(s.logoLink)}>
          <Logo size={20} />
        </Link>
        <Drawer.Root
          open={open}
          onClose={() => setOpen(false)}
          title="KROMA"
          side="left"
          width="xs"
          fullBelow={640}
          pad={0}
          panelStyle={s.navFill}
        >
          <Drawer.Header style={s.drawerHead}>
            <Row between>
              <Box px={8} pb={8}>
                <Logo size={24} />
              </Box>
              <Drawer.Close variant="glass" diameter={40} glyph={20} radius="md" />
            </Row>
          </Drawer.Header>
          <Drawer.Panel>
            <SidebarNav />
          </Drawer.Panel>
        </Drawer.Root>
      </Box>
      <Box row align="center" gap={2}>
        {actions}
      </Box>
    </header>
  );
}

function RequestsLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return (
    <SideNav.Item to="/requests" icon={IconInbox}>
      <SideNav.Label>{t('nav.requests')}</SideNav.Label>
    </SideNav.Item>
  );
}

function ComingSoonLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return (
    <SideNav.Item to="/coming-soon" icon={IconCalendarClock}>
      <SideNav.Label>{t('nav.comingSoon')}</SideNav.Label>
    </SideNav.Item>
  );
}

function MissingLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return (
    <SideNav.Item to="/missing" icon={IconAlertTriangle}>
      <SideNav.Label>{t('nav.missing')}</SideNav.Label>
    </SideNav.Item>
  );
}

function InviteLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'users.manage')) return null;
  return (
    <SideNav.Item to="/invite" icon={IconUserPlus}>
      <SideNav.Label>{t('nav.inviteUser')}</SideNav.Label>
    </SideNav.Item>
  );
}

function AdminLink() {
  const t = useT();
  const { user } = useAuth();
  const isAdmin =
    !!user &&
    (hasPermission(user, 'users.manage') ||
      hasPermission(user, 'library.manage') ||
      hasPermission(user, 'settings.manage') ||
      hasPermission(user, 'requests.manage'));
  return (
    <SideNav.Item to="/admin" icon={IconSettings} disabled={!isAdmin}>
      <SideNav.Label>{t(isAdmin ? 'nav.server' : 'nav.settings')}</SideNav.Label>
    </SideNav.Item>
  );
}

function ModuleNavLinks() {
  const items = useModuleNav('library');
  return (
    <>
      {items.map((n) => (
        <SideNav.Item key={`${n.moduleId}:${n.to}`} to={n.to} icon={resolveModuleIcon(n.icon)}>
          <SideNav.Label>{n.label}</SideNav.Label>
        </SideNav.Item>
      ))}
    </>
  );
}
