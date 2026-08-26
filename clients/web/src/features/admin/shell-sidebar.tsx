import { hasPermission } from '@kroma/core';
import type { ModuleNav } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Box, color, Drawer, Focusable, Logo, Row, sv, Text } from '@kroma/ui/kit';
import { IconChevronRight } from '@tabler/icons-react';
import { useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ScrollView, type ViewStyle } from 'react-native';
import { adminNavSections } from '#web/features/admin/admin-nav';
import { PillDot } from '#web/features/admin/pill';
import { useAdmin } from '#web/features/admin/shell-context';
import { ADMIN_BAR_TOP, ADMIN_RAIL_WIDTH } from '#web/features/admin/web-style';
import { useModuleNavAll } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { formatUptime } from '#web/shared/lib/adminFormat';
import { useAuth } from '#web/shared/lib/auth';
import { safeAreaTop } from '#web/shared/lib/safe-area';
import { useNavActions } from '#web/shared/ui/nav-actions';
import { NavMenuButton } from '#web/shared/ui/nav-menu-button';
import { RouteLink } from '#web/shared/ui/route-link';
import { SideNav } from '#web/shared/ui/side-nav';
import { SIDE_NAV_FRAME, SIDE_NAV_GUTTER } from '#web/shared/ui/side-nav-style';

const NAV_FILL = { backgroundColor: color('bg') } as const;

const serverCard = sv({
  base: {
    row: true,
    align: 'center',
    between: true,
    px: 14,
    py: 10,
    radius: 'md',
    bg: 'surface2',
    border: 'borderStrong',
    borderWidth: 1,
    _hover: { bg: 'surface3' },
  },
});

const RAIL_EDGE: ViewStyle = {
  borderRightWidth: 1,
  borderRightColor: color('border'),
};

const DRAWER_HEAD: ViewStyle = {
  paddingLeft: 24,
  paddingRight: 16,
  paddingBottom: 16,
  ...safeAreaTop(24),
};

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
      <Focusable sv={serverCard} as={<RouteLink to="/" />}>
        <Row gap={10}>
          <Logo markOnly size={17} />
          <Text variant="label" color="accentText">
            {serverInfo?.name ?? 'KROMA'}
          </Text>
        </Row>
        <IconChevronRight size={17} stroke={1.8} color={color('success')} />
      </Focusable>
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

/** The permanent left navigation, rendered only from `lg` up. */
export function AdminSidebar() {
  return (
    <Box role="complementary" w={ADMIN_RAIL_WIDTH} shrink={0} h="100%" bg="bg" style={RAIL_EDGE}>
      <SideNav.Header>
        <AdminBrand />
      </SideNav.Header>
      <AdminServerLink />
      <ScrollView style={SIDE_NAV_FRAME}>
        <AdminNav />
      </ScrollView>
    </Box>
  );
}

/** The phone's pinned bar, and the sheet its menu opens. Rendered only below
 *  `lg`. */
export function AdminMobileTopbar() {
  const actions = useNavActions();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run key; pathname closes the drawer on navigation
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Box
      role="banner"
      row
      align="center"
      between
      shrink={0}
      px={16}
      pb={10}
      bg="bg"
      style={ADMIN_BAR_TOP}
    >
      <Row gap={8}>
        <NavMenuButton open={open} onPress={() => setOpen(true)} />
        <AdminBrand />
      </Row>
      <Row gap={2}>{actions}</Row>
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
    </Box>
  );
}
