import { hasPermission } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { Box, classes, Drawer, Logo, Row, styles, useBreakpoint, useStyles } from '@kromatv/ui/kit';
import { Link, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { CATALOG_NAV } from '#web/features/catalog/catalog-nav';
import { UserChip, VersionInfo } from '#web/features/catalog/sidebar-account';
import {
  ServerUpdateIndicator,
  ServerUpdateNotice,
} from '#web/features/catalog/server-update-notice';
import { WhatsNewLink } from '#web/features/catalog/whats-new-link';
import { useModuleNav } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { useAuth } from '#web/shared/lib/auth';
import { useNavActions } from '#web/shared/ui/nav-actions';
import { NavMenuButton } from '#web/shared/ui/nav-menu-button';
import { SideNav } from '#web/shared/ui/side-nav';
import { SIDE_NAV_FRAME, SIDE_NAV_GUTTER } from '#web/shared/ui/side-nav-style';

// `position: sticky`, `100vh`, `overflow-y` and `env()` have no React Native
// spelling, so the shell's own frames stay CSS around kit content.
const sDefinition = styles({
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
    backgroundColor: 'var(--kroma-surface-1)',
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
  navFill: { bg: 'surface1' },
  scrollContent: { flexGrow: 1 },
  accountArea: { pt: 12, mt: 12, borderTopWidth: 1, borderTopColor: 'border' },
});

// `env()` has no React Native spelling, so the sheet's own insets stay CSS.

export function Sidebar() {
  const s = useStyles(sDefinition);

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
  const s = useStyles(sDefinition);
  return (
    <ScrollView style={SIDE_NAV_FRAME} contentContainerStyle={s.scrollContent}>
      <SidebarNav />
    </ScrollView>
  );
}

function SidebarNav() {
  const t = useT();
  const s = useStyles(sDefinition);
  return (
    <SideNav.Root>
      <SideNav.Group label={t('nav.discover')}>
        {CATALOG_NAV.map((item) => (
          <SideNav.Item key={item.to} to={item.to} exact={item.exact} icon={item.icon}>
            <SideNav.Label>{t(item.labelKey)}</SideNav.Label>
          </SideNav.Item>
        ))}
      </SideNav.Group>
      <SideNav.Group label={t('nav.yourSpace')}>
        <SideNav.Item to="/my-list" icon="bookmark">
          <SideNav.Label>{t('nav.myList')}</SideNav.Label>
        </SideNav.Item>
        <RequestsLink />
        <ModuleNavLinks />
      </SideNav.Group>
      <SideNav.Footer>
        <ServerUpdateNotice />
        <SideNav.Group label={t('nav.more')}>
          <InviteLink />
          <SideNav.Item to="/connect" icon="device-desktop">
            <SideNav.Label>{t('nav.connectDevice')}</SideNav.Label>
          </SideNav.Item>
          <AdminLink />
          <WhatsNewLink />
        </SideNav.Group>
        <Box style={s.accountArea}>
          <UserChip />
          <Box px={10} pt={6}>
            <VersionInfo />
          </Box>
        </Box>
      </SideNav.Footer>
    </SideNav.Root>
  );
}

export function MobileTopbar() {
  const s = useStyles(sDefinition);

  const actions = useNavActions();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const step = useBreakpoint();
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }
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
        <ServerUpdateIndicator />
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
    <SideNav.Item to="/requests" icon="inbox">
      <SideNav.Label>{t('nav.requests')}</SideNav.Label>
    </SideNav.Item>
  );
}

function InviteLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'users.manage')) return null;
  return (
    <SideNav.Item to="/invite" icon="user-plus">
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
  if (!isAdmin) return null;
  return (
    <SideNav.Item to="/admin" icon="settings">
      <SideNav.Label>{t('nav.server')}</SideNav.Label>
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
