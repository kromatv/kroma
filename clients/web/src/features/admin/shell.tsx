// Admin console shell: the left sidebar (identity + nav + live status card) and
// the data/event context (server info + a tick that bumps on server events so
// pages can refresh live).

import { AdminKitProvider } from '@kroma/admin-kit';
import {
  hasPermission,
  KromaEvents,
  type MessageKey,
  type Permission,
  type ServerInfo,
} from '@kroma/core';
import type { ModuleNav } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Logo } from '@kroma/ui/kit';
import * as Dialog from '@radix-ui/react-dialog';
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
  IconMenu2,
  IconSettings,
  IconSitemap,
  IconSparkles,
  IconTerminal2,
  IconTransform,
  IconUsers,
  IconWorld,
  IconX,
  type TablerIcon,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { usePoll } from '#web/features/admin/hooks';
import { AdminModalHosts } from '#web/features/admin/modal-hosts';
import { useModuleNavAll } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { formatUptime } from '#web/shared/lib/adminFormat';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';

export { HeaderAction, PageHeader } from '@kroma/admin-kit';
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
    <AdminKitProvider value={kit}>
      <AdminContext.Provider value={adminValue}>{children}</AdminContext.Provider>
    </AdminKitProvider>
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

const linkCls =
  'flex items-center gap-3 rounded-md px-3.5 py-2.5 text-[14px] font-semibold text-muted no-underline transition-colors hover:bg-white/4 hover:text-text aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent';

function AdminBrand() {
  const t = useT();
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={19} />
      <span className="rounded-[5px] bg-accent px-1.5 py-0.75 text-[8.5px] font-bold tracking-[.13em] text-accent-ink">
        {t('admin.badge')}
      </span>
    </div>
  );
}

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
      <div className="shrink-0 px-3.5 pb-2">
        <Link
          to="/"
          className="flex items-center justify-between rounded-[11px] border border-border-strong bg-surface-2 px-3.5 py-2.5 no-underline"
        >
          <span className="inline-flex items-center gap-2.5 text-[14px] font-bold text-accent">
            <Logo markOnly size={17} />
            {serverInfo?.name ?? 'KROMA'}
          </span>
          <IconChevronRight size={17} stroke={1.8} color="#46D08D" />
        </Link>
      </div>

      {/* The only part of the sidebar that scrolls when sections overflow. */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3">
        {groups.map((g) => (
          <SidebarGroup key={g.labelKey} label={t(g.labelKey)}>
            {g.items.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={linkCls}
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
      </nav>

      <div className="shrink-0 px-3.5 pb-6 pt-2">
        <ServerStatusCard />
      </div>
    </>
  );
}

function AdminSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-[#0C0C0E] lg:flex">
      <div className="mb-4 shrink-0 px-6 pt-6">
        <AdminBrand />
      </div>
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
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-[#0C0C0E]/95 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
      <AdminBrand />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label={t('nav.menu')}
            className="flex h-10 w-10 items-center justify-center rounded-[11px] text-muted transition-colors hover:bg-white/4 hover:text-text"
          >
            <IconMenu2 size={22} />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 animate-[fade-in_.2s_var(--ease-out)] lg:hidden" />
          <Dialog.Content
            className="fixed inset-y-0 left-0 z-50 flex w-full flex-col border-border bg-[#0C0C0E] outline-none sm:w-[min(19rem,85vw)] sm:border-r lg:hidden"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">KROMA</Dialog.Title>
            <div className="mb-4 flex shrink-0 items-center justify-between px-6 pr-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
              <AdminBrand />
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={t('common.close')}
                  className="flex h-10 w-10 items-center justify-center rounded-[11px] text-muted transition-colors hover:bg-white/4 hover:text-text"
                >
                  <IconX size={20} />
                </button>
              </Dialog.Close>
            </div>
            <AdminSidebarBody />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}

function ModuleNavLink({ item }: Readonly<{ item: ModuleNav }>) {
  const Icon = resolveModuleIcon(item.icon);
  return (
    <Link to={item.to} className={linkCls}>
      <Icon size={18} stroke={1.7} />
      {item.label}
    </Link>
  );
}

function SidebarGroup({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <>
      <div className="px-3 pb-2 pt-4.5 text-[10px] font-bold uppercase tracking-[.16em] text-dim first:pt-1">
        {label}
      </div>
      {children}
    </>
  );
}

function ServerStatusCard() {
  const t = useT();
  const { serverInfo } = useAdmin();
  return (
    <div className="rounded-xl border border-border bg-[#121216] p-3.5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="h-2 w-2 animate-[kroma-breathe_2s_ease-in-out_infinite] rounded-full bg-success" />
        <span className="text-[13px] font-bold text-success">{t('admin.online')}</span>
      </div>
      <div className="text-[12.5px] font-semibold text-text">
        {serverInfo ? `${serverInfo.hostname} · v${serverInfo.version}` : '…'}
      </div>
      <div className="mt-0.75 text-[11px] font-medium text-dim">
        {serverInfo ? t('admin.uptime', { uptime: formatUptime(serverInfo.uptimeSec) }) : ''}
      </div>
    </div>
  );
}

export function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AdminProvider>
      <div className="flex min-h-screen w-full flex-col bg-bg text-text lg:flex-row">
        <AdminSidebar />
        <AdminMobileTopbar />
        {/* Same gutter + vertical rhythm as the catalogue pages (PAGE_MAIN) so every page aligns. */}
        <main className="min-w-0 flex-1 px-(--gutter-web) pb-20 pt-9">{children}</main>
      </div>
      <AdminModalHosts />
    </AdminProvider>
  );
}
