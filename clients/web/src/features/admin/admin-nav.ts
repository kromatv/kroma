import type { MessageKey, Permission } from '@kroma/core';
import type { ModuleNav } from '@kroma/module-sdk';
import {
  IconApps,
  IconArchive,
  IconBell,
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

/** One console page. `cap: null` is visible to any admin (the read-only
 *  dashboard panels); otherwise the page needs that capability, mirroring the
 *  server-side guards in `api/admin.rs`. */
export interface AdminNavItem {
  to: string;
  labelKey: MessageKey;
  cap: Permission | null;
  icon: TablerIcon;
  /** Whether only the exact path reads as the current page. */
  exact?: boolean;
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
export function adminNavSections(
  moduleNav: readonly ModuleNav[],
  allowed: (cap: Permission | null) => boolean,
): { sections: AdminNavSection[]; orphans: ModuleNav[] } {
  const known = new Set(NAV_GROUPS.map((group) => group.section));
  const sections = NAV_GROUPS.map((group) => ({
    labelKey: group.labelKey,
    items: group.items.filter((item) => allowed(item.cap)),
    modules: moduleNav.filter((module) => sectionOf(module) === group.section),
  })).filter((group) => group.items.length > 0 || group.modules.length > 0);
  return { sections, orphans: moduleNav.filter((module) => !known.has(sectionOf(module))) };
}
