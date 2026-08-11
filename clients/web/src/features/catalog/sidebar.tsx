import buildInfo from 'virtual:build-info';
import { hasPermission, type MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import { color, Drawer, Logo, Menu, type MenuTriggerBind } from '@kroma/ui/kit';
import {
  IconAlertTriangle,
  IconCalendarClock,
  IconCategory,
  IconDeviceDesktop,
  IconDeviceTv,
  IconHome,
  IconInbox,
  IconListDetails,
  IconMenu2,
  IconMovie,
  IconSearch,
  IconSettings,
  IconUserPlus,
  IconX,
  type TablerIcon,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { NotificationBell } from '#web/features/notifications/panel';
import { useModuleNav } from '#web/modules/ModuleHostProvider';
import { resolveModuleIcon } from '#web/modules/module-icons';
import { useAuth } from '#web/shared/lib/auth';
import { serverQueries } from '#web/shared/lib/queries';
import { CapabilityChip } from '#web/shared/ui/capability-chip';
import { UserAvatar } from '#web/shared/ui/user-avatar';

const itemCls =
  'flex items-center gap-3.5 rounded-md px-3.5 py-3 text-[15px] max-lg:text-[16px] font-semibold text-muted no-underline transition-colors duration-200 hover:bg-white/4 hover:text-text aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent';

const NAV: { labelKey: MessageKey; to: string; icon: TablerIcon; exact?: boolean }[] = [
  { labelKey: 'nav.home', to: '/', icon: IconHome, exact: true },
  { labelKey: 'nav.search', to: '/search', icon: IconSearch },
  { labelKey: 'nav.films', to: '/films', icon: IconMovie },
  { labelKey: 'nav.series', to: '/series', icon: IconDeviceTv },
  { labelKey: 'nav.genres', to: '/genres', icon: IconCategory },
  { labelKey: 'nav.myList', to: '/mylist', icon: IconListDetails },
];

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen flex-col self-start border-r border-border bg-bg lg:flex">
      <div className="shrink-0 px-4.5 pb-2 pt-7">
        <div className="flex items-center justify-between px-2 pb-2">
          <Logo size={24} />
          <NotificationBell />
        </div>
      </div>
      <SidebarBody />
    </aside>
  );
}

// Account/device block is pinned to the bottom via mt-auto: it reads as a fixed
// footer on a normal window, and scrolls (rather than clipping) when too short.
function SidebarBody() {
  const t = useT();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4.5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-1">
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={itemCls}
            activeOptions={{ exact: item.exact ?? false }}
          >
            <item.icon size={18} />
            {t(item.labelKey)}
          </Link>
        ))}
        <RequestsLink />
        <ComingSoonLink />
        <MissingLink />
        <ModuleNavLinks />
      </nav>
      <div className="mt-auto flex flex-col gap-2.5 pt-6">
        <InviteLink />
        <Link to="/connect" className={itemCls}>
          <IconDeviceDesktop size={18} />
          {t('nav.connectDevice')}
        </Link>
        <AdminLink />
        <UserChip />
        <div className="flex flex-col gap-2 px-2 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-dim">
              {t('nav.thisDevice')}
            </span>
            <CapabilityChip />
          </div>
          <VersionInfo />
        </div>
      </div>
    </div>
  );
}

export function MobileTopbar() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run key; pathname closes the drawer on navigation
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-bg/95 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
      <Link to="/" aria-label="KROMA">
        <Logo size={20} />
      </Link>
      <div className="flex items-center gap-0.5">
        <NotificationBell />
        <button
          type="button"
          aria-label={t('nav.menu')}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/4 hover:text-text"
        >
          <IconMenu2 size={22} />
        </button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="KROMA"
          side="left"
          width={304}
          fullBelow={640}
          panelStyle={NAV_FILL}
        >
          <div className="flex shrink-0 items-center justify-between px-4.5 pb-2 pt-[max(1.75rem,env(safe-area-inset-top))]">
            <div className="px-2 pb-2">
              <Logo size={24} />
            </div>
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/4 hover:text-text"
            >
              <IconX size={20} />
            </button>
          </div>
          <SidebarBody />
        </Drawer>
      </div>
    </header>
  );
}

const NAV_FILL = { backgroundColor: color('bg') } as const;

function RequestsLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return (
    <Link to="/requests" className={itemCls}>
      <IconInbox size={18} />
      {t('nav.requests')}
    </Link>
  );
}

function ComingSoonLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return (
    <Link to="/coming-soon" className={itemCls}>
      <IconCalendarClock size={18} />
      {t('nav.comingSoon')}
    </Link>
  );
}

function MissingLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'requests.create')) return null;
  return (
    <Link to="/missing" className={itemCls}>
      <IconAlertTriangle size={18} />
      {t('nav.missing')}
    </Link>
  );
}

// Client version + commit come from the build-time `virtual:build-info` module;
// the server version is the public `/api/health` endpoint.
function VersionInfo() {
  const t = useT();
  const { data: health } = useQuery(serverQueries.health());
  const clientTitle = `${buildInfo.commit}${buildInfo.dirty ? '-dirty' : ''} · ${buildInfo.branch} · ${buildInfo.buildDate}`;
  return (
    <div className="flex items-center gap-1.5 px-0.5 text-[10px] font-medium text-dim">
      <span title={clientTitle}>
        {t('nav.versionClient')} <span className="tabular-nums">v{buildInfo.version}</span>
      </span>
      <span className="opacity-40">·</span>
      <span>
        {t('nav.versionServer')}{' '}
        <span className="tabular-nums">{health ? `v${health.version}` : '…'}</span>
      </span>
    </div>
  );
}

function InviteLink() {
  const t = useT();
  const { user } = useAuth();
  if (!user || !hasPermission(user, 'users.manage')) return null;
  return (
    <Link to="/invite" className={itemCls}>
      <IconUserPlus size={18} />
      {t('nav.inviteUser')}
    </Link>
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
  if (!isAdmin) {
    return (
      <div className={`${itemCls} cursor-default opacity-50`}>
        <IconSettings size={18} />
        {t('nav.settings')}
      </div>
    );
  }
  return (
    <Link to="/admin" className={itemCls}>
      <IconSettings size={18} />
      {t('nav.server')}
    </Link>
  );
}

function ModuleNavLinks() {
  const items = useModuleNav('library');
  return (
    <>
      {items.map((n) => {
        const Icon = resolveModuleIcon(n.icon);
        return (
          <Link key={`${n.moduleId}:${n.to}`} to={n.to} className={itemCls}>
            <Icon size={18} />
            {n.label}
          </Link>
        );
      })}
    </>
  );
}

function UserChip() {
  const t = useT();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  // Return to the current page after switching profile.
  const href = useRouterState({ select: (s) => s.location.href });
  if (!user) return null;
  return (
    <Menu.Root label={t('nav.account')} align="start">
      <Menu.Trigger render={userChipTrigger(user, t('nav.account'))} />
      <Menu.Item
        icon="user-circle"
        label={t('nav.accountSettings')}
        onSelect={() => void navigate({ to: '/account' })}
      />
      <Menu.Item
        icon="users"
        label={t('nav.changeProfile')}
        onSelect={() => void navigate({ to: '/login', search: { redirect: href } })}
      />
      <Menu.Separator />
      <Menu.Item
        icon="logout"
        label={t('auth.logout')}
        tone="danger"
        onSelect={() => void logout()}
      />
    </Menu.Root>
  );
}

// Built out here rather than inline in <UserChip>: a render prop is still a
// function returning elements, and one written inside the parent remounts its
// subtree on every render of it.
const userChipTrigger = (user: ChipUser, label: string) => (bind: MenuTriggerBind) => (
  <UserChipTrigger bind={bind} user={user} label={label} />
);

interface ChipUser {
  id: string;
  username: string;
  avatarUrl?: string | null;
}

function UserChipTrigger({
  bind,
  user,
  label,
}: Readonly<{ bind: MenuTriggerBind; user: ChipUser; label: string }>) {
  const { ref, expanded, onPress } = bind;
  return (
    <button
      ref={ref as unknown as React.Ref<HTMLButtonElement>}
      type="button"
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onPress}
      className={`mt-2 flex items-center gap-3 rounded-md p-2.5 text-left transition-colors hover:bg-white/4 focus:outline-none ${expanded ? 'bg-white/4' : ''}`}
      title={label}
    >
      <UserAvatar
        name={user.username}
        avatarUrl={user.avatarUrl}
        seed={user.id}
        size={36}
        radius={10}
      />
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold text-text">{user.username}</div>
        <div className="truncate text-[11px] font-medium text-dim">{label}</div>
      </div>
    </button>
  );
}
