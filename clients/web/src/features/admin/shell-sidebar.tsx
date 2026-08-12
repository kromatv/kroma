// The console's navigation, in its two forms: the permanent aside from `lg` up
// and the sheet a phone opens from its topbar. Both draw the same column.

import { hasPermission } from '@kroma/core';
import type { ModuleNav } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Box, color, Drawer, IconButton, Logo, Row, Text } from '@kroma/ui/kit';
import { IconChevronRight } from '@tabler/icons-react';
import { Link, useRouterState } from '@tanstack/react-router';
import { type CSSProperties, useEffect, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { adminNavSections } from '#web/features/admin/admin-nav';
import { PillDot } from '#web/features/admin/pill';
import { useAdmin } from '#web/features/admin/shell-context';
import { ADMIN_SIDEBAR, ADMIN_TOPBAR } from '#web/features/admin/web-style';
import { useModuleNavAll } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { formatUptime } from '#web/shared/lib/adminFormat';
import { useAuth } from '#web/shared/lib/auth';
import { useNavActions } from '#web/shared/ui/nav-actions';
import { SideNav } from '#web/shared/ui/side-nav';
import { SIDE_NAV_FRAME, SIDE_NAV_GUTTER } from '#web/shared/ui/side-nav-style';

// The server card at the head of the sidebar is a router <a>, so it carries its
// own reset rather than the kit's.
const SERVER_LINK: CSSProperties = { display: 'block', textDecoration: 'none' };

const NAV_FILL = { backgroundColor: color('bg') } as const;

// `env()` has no React Native spelling, so the sheet's own insets stay CSS.
const DRAWER_HEAD = {
  paddingLeft: 24,
  paddingRight: 16,
  paddingTop: 'max(24px, env(safe-area-inset-top))',
  paddingBottom: 16,
} as unknown as ViewStyle;

function AdminBrand() {
  const t = useT();
  return (
    <Row gap={10}>
      <Logo size={19} />
      <Box radius={4} bg="accent" px={6} py={3}>
        <Text variant="overline" color="accentInk">
          {t('admin.badge')}
        </Text>
      </Box>
    </Row>
  );
}

function AdminServerLink() {
  const { serverInfo } = useAdmin();
  return (
    <Box shrink={0} px={SIDE_NAV_GUTTER} pb={8}>
      <Link to="/" style={SERVER_LINK}>
        <Row between px={14} py={10} radius="md" bg="surface2" border="borderStrong">
          <Row gap={10}>
            <Logo markOnly size={17} />
            <Text variant="label" color="accentText">
              {serverInfo?.name ?? 'KROMA'}
            </Text>
          </Row>
          <IconChevronRight size={17} stroke={1.8} color={color('success')} />
        </Row>
      </Link>
    </Box>
  );
}

function ModuleNavLink({ item }: Readonly<{ item: ModuleNav }>) {
  return (
    <SideNav.Item to={item.to} icon={resolveModuleIcon(item.icon)}>
      <SideNav.Label>{item.label}</SideNav.Label>
    </SideNav.Item>
  );
}

function AdminNav() {
  const t = useT();
  const { user } = useAuth();
  // Module pages target a nav group by `section` (e.g. Torrents -> "acquisition")
  // and render inside it beside the built-in pages; one whose section names no
  // group at all falls into a generic "Module pages" group.
  const { sections, orphans } = adminNavSections(
    useModuleNavAll(),
    (cap) => !cap || (!!user && hasPermission(user, cap)),
  );
  return (
    <SideNav.Root>
      {sections.map((section) => (
        <SideNav.Group key={section.labelKey} label={t(section.labelKey)}>
          {section.items.map((item) => (
            <SideNav.Item key={item.to} to={item.to} exact={item.exact} icon={item.icon}>
              <SideNav.Label>{t(item.labelKey)}</SideNav.Label>
            </SideNav.Item>
          ))}
          {section.modules.map((item) => (
            <ModuleNavLink key={`${item.moduleId}:${item.to}`} item={item} />
          ))}
        </SideNav.Group>
      ))}
      {orphans.length > 0 && (
        <SideNav.Group label={t('admin.groupModulePages')}>
          {orphans.map((item) => (
            <ModuleNavLink key={`${item.moduleId}:${item.to}`} item={item} />
          ))}
        </SideNav.Group>
      )}
      <SideNav.Footer>
        <ServerStatusCard />
      </SideNav.Footer>
    </SideNav.Root>
  );
}

function ServerStatusCard() {
  const t = useT();
  const { serverInfo } = useAdmin();
  return (
    <Box p={14} radius="lg" bg="surface1" border="border">
      <Row gap={10} mb={8}>
        <PillDot tone="success" size={8} pulse />
        <Text variant="meta" color="success">
          {t('admin.online')}
        </Text>
      </Row>
      <Text variant="meta">
        {serverInfo ? `${serverInfo.hostname} · v${serverInfo.version}` : '…'}
      </Text>
      <Text variant="meta" color="textDim" mt={3}>
        {serverInfo ? t('admin.uptime', { uptime: formatUptime(serverInfo.uptimeSec) }) : ''}
      </Text>
    </Box>
  );
}

/** The permanent left navigation, which exists only from `lg` up. */
export function AdminSidebar() {
  return (
    <aside className={ADMIN_SIDEBAR}>
      <SideNav.Header>
        <AdminBrand />
      </SideNav.Header>
      <AdminServerLink />
      {/* The only part of the sidebar that scrolls when the sections overflow. */}
      <div style={SIDE_NAV_FRAME}>
        <AdminNav />
      </div>
    </aside>
  );
}

/** The phone's pinned bar, and the sheet its menu opens. */
export function AdminMobileTopbar() {
  const t = useT();
  const actions = useNavActions();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run key; pathname closes the drawer on navigation
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className={ADMIN_TOPBAR}>
      <AdminBrand />
      <Row gap={2}>
        {actions}
        <IconButton
          variant="ghost"
          icon="menu-2"
          glyph={22}
          label={t('nav.menu')}
          onPress={() => setOpen(true)}
        />
      </Row>
      <Drawer.Root
        open={open}
        onClose={() => setOpen(false)}
        title="KROMA"
        side="left"
        width="xs"
        fullBelow={640}
        pad={0}
        panelStyle={NAV_FILL}
      >
        <Drawer.Header style={DRAWER_HEAD}>
          <Row between>
            <AdminBrand />
            <Drawer.Close glyph={20} />
          </Row>
        </Drawer.Header>
        <Drawer.Panel>
          <AdminServerLink />
          <AdminNav />
        </Drawer.Panel>
      </Drawer.Root>
    </header>
  );
}
