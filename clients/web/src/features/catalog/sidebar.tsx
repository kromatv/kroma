import { hasPermission, type MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, color, Drawer, IconButton, Logo, Text, useBreakpoint } from '@kroma/ui/kit';
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconCategory,
  IconDeviceDesktop,
  IconDeviceTv,
  IconHome,
  IconInbox,
  IconListDetails,
  IconMovie,
  IconSearch,
  IconSettings,
  IconUserPlus,
  type TablerIcon,
} from '@tabler/icons-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { type CSSProperties, useEffect, useState } from 'react';
import { UserChip, VersionInfo } from '#web/features/catalog/sidebar-account';
import { NavItem, NavRow } from '#web/features/catalog/sidebar-nav';
import { NotificationBell } from '#web/features/notifications/panel';
import { useModuleNav } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { useAuth } from '#web/shared/lib/auth';
import { CapabilityChip } from '#web/shared/ui/capability-chip';

// `position: sticky`, `100vh`, `overflow-y` and `env()` have no React Native
// spelling, so the shell's own frames stay CSS around kit content.
const SIDEBAR: CSSProperties = {
  position: 'sticky',
  top: 0,
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'flex-start',
  borderRightWidth: 1,
  borderRightStyle: 'solid',
  borderRightColor: 'var(--kroma-border)',
  background: 'var(--kroma-bg)',
};

const BODY: CSSProperties = {
  display: 'flex',
  minHeight: 0,
  flex: 1,
  flexDirection: 'column',
  overflowY: 'auto',
  paddingLeft: 18,
  paddingRight: 18,
  paddingTop: 4,
  paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))',
};

const TOPBAR: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottomWidth: 1,
  borderBottomStyle: 'solid',
  borderBottomColor: 'var(--kroma-border)',
  background: 'color-mix(in srgb, var(--kroma-bg) 95%, transparent)',
  paddingLeft: 16,
  paddingRight: 16,
  paddingBottom: 10,
  paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
};

const DRAWER_HEAD: CSSProperties = {
  display: 'flex',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingLeft: 18,
  paddingRight: 18,
  paddingBottom: 8,
  paddingTop: 'max(1.75rem, env(safe-area-inset-top))',
};

const NAV_LIST: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };

const LOGO_LINK: CSSProperties = { display: 'block', color: 'inherit', textDecoration: 'none' };

const NAV_FILL = { backgroundColor: color('bg') } as const;

const NAV: { labelKey: MessageKey; to: string; icon: TablerIcon; exact?: boolean }[] = [
  { labelKey: 'nav.home', to: '/', icon: IconHome, exact: true },
  { labelKey: 'nav.search', to: '/search', icon: IconSearch },
  { labelKey: 'nav.films', to: '/films', icon: IconMovie },
  { labelKey: 'nav.series', to: '/series', icon: IconDeviceTv },
  { labelKey: 'nav.genres', to: '/genres', icon: IconCategory },
  { labelKey: 'nav.myList', to: '/mylist', icon: IconListDetails },
];

export function Sidebar() {
  const step = useBreakpoint();
  if (step !== 'lg' && step !== 'tv') return null;
  return (
    <aside style={SIDEBAR}>
      <Box shrink={0} px={18} pb={8} pt={28}>
        <Box row align="center" between px={8} pb={8}>
          <Logo size={24} />
          <NotificationBell />
        </Box>
      </Box>
      <SidebarBody />
    </aside>
  );
}

// Account/device block is pinned to the bottom via `mt: auto`: it reads as a
// fixed footer on a normal window, and scrolls (rather than clipping) when too
// short.
function SidebarBody() {
  const t = useT();
  return (
    <div style={BODY}>
      <nav style={NAV_LIST}>
        {NAV.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            exact={item.exact}
            glyph={item.icon}
            label={t(item.labelKey)}
          />
        ))}
        <RequestsLink />
        <ComingSoonLink />
        <MissingLink />
        <ModuleNavLinks />
      </nav>
      <Box mt="auto" gap={10} pt={24}>
        <InviteLink />
        <NavItem to="/connect" glyph={IconDeviceDesktop} label={t('nav.connectDevice')} />
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
      </Box>
    </div>
  );
}

export function MobileTopbar() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const step = useBreakpoint();
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run key; pathname closes the drawer on navigation
  useEffect(() => setOpen(false), [pathname]);
  if (step === 'lg' || step === 'tv') return null;
  return (
    <header style={TOPBAR}>
      <Link to="/" aria-label="KROMA" style={LOGO_LINK}>
        <Logo size={20} />
      </Link>
      <Box row align="center" gap={2}>
        <NotificationBell />
        <IconButton
          size={40}
          glyph={22}
          radius="md"
          icon="menu-2"
          label={t('nav.menu')}
          expanded={open}
          onPress={() => setOpen(true)}
        />
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="KROMA"
          side="left"
          width={304}
          fullBelow={640}
          panelStyle={NAV_FILL}
        >
          <div style={DRAWER_HEAD}>
            <Box px={8} pb={8}>
              <Logo size={24} />
            </Box>
            <IconButton
              size={40}
              glyph={20}
              radius="md"
              icon="x"
              label={t('common.close')}
              onPress={() => setOpen(false)}
            />
          </div>
          <SidebarBody />
        </Drawer>
      </Box>
    </header>
  );
}

function RequestsLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return <NavItem to="/requests" glyph={IconInbox} label={t('nav.requests')} />;
}

function ComingSoonLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return <NavItem to="/coming-soon" glyph={IconCalendarClock} label={t('nav.comingSoon')} />;
}

function MissingLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return <NavItem to="/missing" glyph={IconAlertTriangle} label={t('nav.missing')} />;
}

function InviteLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'users.manage')) return null;
  return <NavItem to="/invite" glyph={IconUserPlus} label={t('nav.inviteUser')} />;
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
  if (!isAdmin) {
    return <NavRow glyph={IconSettings} label={t('nav.settings')} dim />;
  }
  return <NavItem to="/admin" glyph={IconSettings} label={t('nav.server')} />;
}

function ModuleNavLinks() {
  const items = useModuleNav('library');
  return (
    <>
      {items.map((n) => (
        <NavItem
          key={`${n.moduleId}:${n.to}`}
          to={n.to}
          glyph={resolveModuleIcon(n.icon)}
          label={n.label}
        />
      ))}
    </>
  );
}
