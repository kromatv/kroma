// Admin console shell: the left sidebar (identity + nav + live status card) and
// the data/event context (server info + a tick that bumps on server events so
// pages can refresh live).

import {
  hasPermission,
  KromaEvents,
  type MessageKey,
  type Permission,
  type ServerInfo,
} from '@kroma/core';
import { AdminHostProvider, type ModuleNav } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Box, color, Drawer, IconButton, Logo, Row, Text } from '@kroma/ui/kit';
import {
  IconApps,
  IconArchive,
  IconBell,
  IconChevronRight,
  IconClockBolt,
  IconDatabase,
  IconFlag,
  IconInbox,
  IconLayoutDashboard,
  IconLibrary,
  IconSettings,
  IconSitemap,
  IconSparkles,
  IconTerminal2,
  IconTransform,
  IconUsers,
  IconWorld,
  type TablerIcon,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ViewStyle } from 'react-native';
import { usePoll } from '#web/features/admin/hooks';
import { AdminModalHosts } from '#web/features/admin/modal-hosts';
import { PillDot } from '#web/features/admin/pill';
import {
  ADMIN_NAV_LINK,
  ADMIN_SHELL,
  ADMIN_SIDEBAR,
  ADMIN_SIDEBAR_NAV,
  ADMIN_TOPBAR,
} from '#web/features/admin/web-style';
import { useModuleNavAll } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { formatUptime } from '#web/shared/lib/adminFormat';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { PAGE_MAIN } from '#web/shared/ui';

export { PageHeader } from '@kroma/ui/kit';
// Data hooks + capability helpers and the page header live in sibling modules;
// re-exported here so call sites keep importing them from this shell module.
export { Denied, isAnyAdmin, useAsyncAction, useCap, usePoll } from '#web/features/admin/hooks';

interface AdminCtx {
  serverInfo: ServerInfo | null;
}

const AdminContext = createContext<AdminCtx | null>(null);

export function AdminProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { client, user } = useAuth();
  const queryClient = useQueryClient();
  // So both built-in and module admin pages share one data + capability surface
  // without importing app internals.
  const kit = useMemo(() => ({ client, user, apiBase: apiBase() }), [client, user]);
  const { data: serverInfo } = usePoll(['admin', 'server'], () => client.adminServer(), 15000);

  // Skip the high-frequency per-line frames (the pages that want them stream
  // those themselves); coalesce the rest to one refresh per window, since e.g.
  // an enrich pass emits one item.updated per title. Compared as plain strings:
  // download.progress is a module's frame, not part of core's union.
  useEffect(() => {
    const highFrequency = new Set([
      'job.log',
      'job.progress',
      'download.progress',
      'module.op.progress',
      'module.op.done',
    ]);
    let pending: ReturnType<typeof setTimeout> | null = null;
    const ev = new KromaEvents(apiBase(), {
      onEvent: (e) => {
        if (highFrequency.has(e.type)) return;
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          void queryClient.invalidateQueries({ queryKey: ['admin'] });
        }, 1500);
      },
    });
    ev.connect();
    return () => {
      if (pending) clearTimeout(pending);
      ev.close();
    };
  }, [queryClient]);

  const adminValue = useMemo(() => ({ serverInfo }), [serverInfo]);

  return (
    <AdminHostProvider value={kit}>
      <AdminContext.Provider value={adminValue}>{children}</AdminContext.Provider>
    </AdminHostProvider>
  );
}

export function useAdmin(): AdminCtx {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within <AdminProvider>');
  return ctx;
}

// `cap: null` → visible to any admin (the read-only dashboard panels); otherwise
// the item needs that specific capability, mirroring the server-side guards in
// `api/admin.rs`.
interface NavItem {
  to: string;
  labelKey: MessageKey;
  cap: Permission | null;
  icon: TablerIcon;
  exact?: boolean;
}

const NAV_GROUPS: { labelKey: MessageKey; section: string; items: NavItem[] }[] = [
  {
    labelKey: 'admin.groupManagement',
    section: 'management',
    items: [
      {
        to: '/admin',
        labelKey: 'admin.dashboard',
        exact: true,
        cap: null,
        icon: IconLayoutDashboard,
      },
      { to: '/admin/users', labelKey: 'admin.navUsers', cap: 'users.manage', icon: IconUsers },
      {
        to: '/admin/requests',
        labelKey: 'admin.navRequests',
        cap: 'requests.manage',
        icon: IconInbox,
      },
      {
        to: '/admin/reports',
        labelKey: 'admin.navReports',
        cap: 'reports.manage',
        icon: IconFlag,
      },
    ],
  },
  {
    labelKey: 'admin.groupMedia',
    section: 'media',
    items: [
      {
        to: '/admin/libraries',
        labelKey: 'admin.navLibraries',
        cap: 'library.manage',
        icon: IconLibrary,
      },
      {
        to: '/admin/transcoder',
        labelKey: 'admin.navTranscoder',
        cap: 'settings.manage',
        icon: IconTransform,
      },
      { to: '/admin/ai', labelKey: 'admin.navAi', cap: 'settings.manage', icon: IconSparkles },
    ],
  },
  {
    // Section anchor: the acquisition module pages (Indexers, Downloads, ...)
    // target `section: "acquisition"` and render here; no built-in items of its own.
    labelKey: 'admin.groupAcquisition',
    section: 'acquisition',
    items: [],
  },
  {
    labelKey: 'admin.groupSystem',
    section: 'system',
    items: [
      {
        to: '/admin/modules',
        labelKey: 'admin.navModules',
        cap: 'settings.manage',
        icon: IconApps,
      },
      {
        to: '/admin/general',
        labelKey: 'admin.navGeneral',
        cap: 'settings.manage',
        icon: IconSettings,
      },
      {
        to: '/admin/network',
        labelKey: 'admin.navNetwork',
        cap: 'settings.manage',
        icon: IconWorld,
      },
      {
        to: '/admin/notifications',
        labelKey: 'admin.navNotifications',
        cap: 'settings.manage',
        icon: IconBell,
      },
    ],
  },
  {
    labelKey: 'admin.groupMaintenance',
    section: 'maintenance',
    items: [
      { to: '/admin/jobs', labelKey: 'admin.navJobs', cap: 'settings.manage', icon: IconClockBolt },
      {
        to: '/admin/pipeline',
        labelKey: 'admin.navPipeline',
        cap: 'settings.manage',
        icon: IconSitemap,
      },
      { to: '/admin/storage', labelKey: 'admin.navStorage', cap: null, icon: IconDatabase },
      { to: '/admin/logs', labelKey: 'admin.navLogs', cap: null, icon: IconTerminal2 },
      {
        to: '/admin/backup',
        labelKey: 'admin.navBackup',
        cap: 'settings.manage',
        icon: IconArchive,
      },
    ],
  },
];

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

// The server card at the head of the sidebar is a router <a>, so it carries its
// own reset rather than the kit's.
const SERVER_LINK: CSSProperties = { display: 'block', textDecoration: 'none' };

function AdminSidebarBody() {
  const t = useT();
  const { serverInfo } = useAdmin();
  const { user } = useAuth();
  const visible = (cap: Permission | null) => !cap || (!!user && hasPermission(user, cap));
  // Module pages target a nav-group by `section` (e.g. Torrents -> "acquisition")
  // and render inside the matching group beside the built-in pages.
  const moduleNav = useModuleNavAll();
  const knownSections = new Set(NAV_GROUPS.map((g) => g.section));
  const groups = NAV_GROUPS.map((g) => ({
    labelKey: g.labelKey,
    items: g.items.filter((n) => visible(n.cap)),
    modules: moduleNav.filter((m) => (m.section ?? 'library') === g.section),
  })).filter((g) => g.items.length > 0 || g.modules.length > 0);
  // Module pages whose section names no built-in group (e.g. `section: "admin"`
  // or a custom id) fall into a generic "Module pages" group.
  const orphanModules = moduleNav.filter((m) => !knownSections.has(m.section ?? 'library'));
  return (
    <>
      <Box shrink={0} px={14} pb={8}>
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

      {/* The only part of the sidebar that scrolls when sections overflow. */}
      <nav className={ADMIN_SIDEBAR_NAV}>
        <Box px={14} pb={12}>
          {groups.map((g) => (
            <SidebarGroup key={g.labelKey} label={t(g.labelKey)}>
              {g.items.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={ADMIN_NAV_LINK}
                  activeOptions={{ exact: n.exact ?? false }}
                >
                  <n.icon size={18} stroke={1.7} />
                  {t(n.labelKey)}
                </Link>
              ))}
              {g.modules.map((m) => (
                <ModuleNavLink key={`${m.moduleId}:${m.to}`} item={m} />
              ))}
            </SidebarGroup>
          ))}
          {orphanModules.length > 0 && (
            <SidebarGroup label={t('admin.groupModulePages')}>
              {orphanModules.map((m) => (
                <ModuleNavLink key={`${m.moduleId}:${m.to}`} item={m} />
              ))}
            </SidebarGroup>
          )}
        </Box>
      </nav>

      <Box shrink={0} px={14} pt={8} pb={24}>
        <ServerStatusCard />
      </Box>
    </>
  );
}

function AdminSidebar() {
  return (
    <aside className={ADMIN_SIDEBAR}>
      <Box shrink={0} px={24} pt={24} mb={16}>
        <AdminBrand />
      </Box>
      <AdminSidebarBody />
    </aside>
  );
}

function AdminMobileTopbar() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run key; pathname closes the drawer on navigation
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className={ADMIN_TOPBAR}>
      <AdminBrand />
      <IconButton
        variant="ghost"
        icon="menu-2"
        glyph={22}
        label={t('nav.menu')}
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
        <Box row between shrink={0} pl={24} pr={16} mb={16} style={DRAWER_HEAD}>
          <AdminBrand />
          <IconButton
            variant="ghost"
            icon="x"
            glyph={20}
            label={t('common.close')}
            onPress={() => setOpen(false)}
          />
        </Box>
        <AdminSidebarBody />
      </Drawer>
    </header>
  );
}

const NAV_FILL = { backgroundColor: color('bg') } as const;

// `env()` has no React Native spelling, so the drawer's top inset stays CSS.
const DRAWER_HEAD = { paddingTop: 'max(24px, env(safe-area-inset-top))' } as unknown as ViewStyle;

function ModuleNavLink({ item }: Readonly<{ item: ModuleNav }>) {
  const Icon = resolveModuleIcon(item.icon);
  return (
    <Link to={item.to} className={ADMIN_NAV_LINK}>
      <Icon size={18} stroke={1.7} />
      {item.label}
    </Link>
  );
}

function SidebarGroup({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <>
      <Text variant="overline" color="textDim" px={12} pt={18} pb={8}>
        {label}
      </Text>
      {children}
    </>
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

export function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AdminProvider>
      <div className={ADMIN_SHELL}>
        <AdminSidebar />
        <AdminMobileTopbar />
        {/* Same gutter + vertical rhythm as the catalogue pages (PAGE_MAIN) so every page aligns. */}
        <main className={PAGE_MAIN}>{children}</main>
      </div>
      <AdminModalHosts />
    </AdminProvider>
  );
}
