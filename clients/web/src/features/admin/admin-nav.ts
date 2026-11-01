import type { Permission } from '@kromatv/client/accounts';
import type { MessageKey } from '@kromatv/i18n';
import type { ModuleNav } from '@kromatv/module-sdk';
import type { IconName } from '@kromatv/ui/kit';
import type { RoutePath } from '#web/shared/ui/route-link';

/** One console page. `cap: null` is visible to any admin (the read-only
 *  dashboard panels); otherwise the page needs that capability, or any one of
 *  a list of them, mirroring the server-side guards in `api/admin.rs`. */
export interface AdminNavItem {
  to: RoutePath;
  labelKey: MessageKey;
  cap: Permission | readonly Permission[] | null;
  icon: IconName;
  /** Whether only the exact path reads as the current page. */
  exact?: boolean;
  keywords?: string;
}

/** A named run of console pages. `section` is what a module's own nav entry
 *  targets to render beside them. */
export interface AdminNavGroup {
  labelKey: MessageKey;
  section: string;
  items: AdminNavItem[];
}

export const NAV_GROUPS: AdminNavGroup[] = [
  {
    labelKey: 'admin.groupManagement',
    section: 'management',
    items: [
      {
        to: '/admin',
        labelKey: 'admin.dashboard',
        exact: true,
        cap: null,
        icon: 'layout-dashboard',
      },
      {
        to: '/admin/users',
        labelKey: 'admin.navUsers',
        cap: 'users.manage',
        icon: 'users',
        keywords: 'accounts comptes utilisateurs permissions',
      },
      {
        to: '/admin/history',
        labelKey: 'admin.historyScreen',
        cap: 'users.manage',
        icon: 'history',
      },
      {
        to: '/admin/reports',
        labelKey: 'admin.navReports',
        cap: 'reports.manage',
        icon: 'flag',
      },
    ],
  },
  {
    labelKey: 'admin.groupMedia',
    section: 'media',
    items: [
      {
        to: '/admin/monitoring',
        labelKey: 'admin.navMonitoring',
        cap: ['library.manage', 'requests.manage'],
        icon: 'radar',
      },
      {
        to: '/admin/libraries',
        labelKey: 'admin.navLibraries',
        cap: 'library.manage',
        icon: 'library',
      },
      {
        to: '/admin/transcoder',
        labelKey: 'admin.navTranscoder',
        cap: 'settings.manage',
        icon: 'transform',
      },
      { to: '/admin/ai', labelKey: 'admin.navAi', cap: 'settings.manage', icon: 'sparkles' },
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
        icon: 'apps',
        keywords: 'plugins extensions store',
      },
      {
        to: '/admin/general',
        labelKey: 'admin.navGeneral',
        cap: 'settings.manage',
        icon: 'settings',
      },
      {
        to: '/admin/network',
        labelKey: 'admin.navNetwork',
        cap: 'settings.manage',
        icon: 'world',
        keywords: 'vpn firewall pare-feu proxy rules',
      },
      {
        to: '/admin/notifications',
        labelKey: 'admin.navNotifications',
        cap: 'settings.manage',
        icon: 'bell',
      },
    ],
  },
  {
    labelKey: 'admin.groupMaintenance',
    section: 'maintenance',
    items: [
      {
        to: '/admin/updates',
        labelKey: 'admin.updatesTitle',
        cap: 'settings.manage',
        icon: 'download',
      },
      { to: '/admin/jobs', labelKey: 'admin.navJobs', cap: 'settings.manage', icon: 'clock-bolt' },
      {
        to: '/admin/pipeline',
        labelKey: 'admin.navPipeline',
        cap: 'settings.manage',
        icon: 'sitemap',
      },
      { to: '/admin/storage', labelKey: 'admin.navStorage', cap: null, icon: 'database' },
      { to: '/admin/logs', labelKey: 'admin.navLogs', cap: null, icon: 'terminal-2' },
      {
        to: '/admin/backup',
        labelKey: 'admin.navBackup',
        cap: 'settings.manage',
        icon: 'archive',
        keywords: 'export restore sauvegarde',
      },
    ],
  },
];

/** A group as it is drawn: the built-in pages this viewer may reach, plus the
 *  module pages that target it. */
export interface AdminNavSection {
  labelKey: MessageKey;
  items: AdminNavItem[];
  modules: ModuleNav[];
}

const sectionOf = (item: ModuleNav): string => item.section ?? 'library';

/**
 * The console's navigation for one viewer: the groups with something left in
 * them, and the module pages whose section names no group at all, which the
 * caller draws under a heading of its own.
 */
function permitted(
  cap: AdminNavItem['cap'],
  allowed: (cap: Permission | null) => boolean,
): boolean {
  if (cap === null || typeof cap === 'string') return allowed(cap);
  return cap.some(allowed);
}

export function adminNavSections(
  moduleNav: readonly ModuleNav[],
  allowed: (cap: Permission | null) => boolean,
): { sections: AdminNavSection[]; orphans: ModuleNav[] } {
  const known = new Set(NAV_GROUPS.map((group) => group.section));
  const sections = NAV_GROUPS.map((group) => ({
    labelKey: group.labelKey,
    items: group.items.filter((item) => permitted(item.cap, allowed)),
    modules: moduleNav.filter((module) => sectionOf(module) === group.section),
  })).filter((group) => group.items.length > 0 || group.modules.length > 0);
  return { sections, orphans: moduleNav.filter((module) => !known.has(sectionOf(module))) };
}
