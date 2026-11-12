import type { MessageKey } from '@kromatv/i18n';
import type { IconName } from '@kromatv/ui/kit';
import type { PermissionAccess, PermissionCategory } from '#web/features/admin/module-permissions';

interface CategoryView {
  icon: IconName;
  title: MessageKey;
  line: MessageKey | Record<PermissionAccess, MessageKey>;
  note?: MessageKey;
}

/** How each kind of access is drawn and named: its glyph, its title, the line
 *  an install dialog says it with, and for what reaches past the module's
 *  isolation, why. */
export const CATEGORY_VIEW: Record<PermissionCategory, CategoryView> = {
  run: {
    icon: 'terminal-2',
    title: 'modulePermissions.runTitle',
    line: 'modulePermissions.runTitle',
    note: 'modulePermissions.runNote',
  },
  host: {
    icon: 'network',
    title: 'modulePermissions.hostTitle',
    line: 'modulePermissions.hostTitle',
    note: 'modulePermissions.hostNote',
  },
  accounts: {
    icon: 'user-circle',
    title: 'modulePermissions.accountsTitle',
    line: {
      read: 'modulePermissions.lineAccountsRead',
      write: 'modulePermissions.lineAccountsWrite',
    },
  },
  files: {
    icon: 'folder',
    title: 'modulePermissions.filesTitle',
    line: { read: 'modulePermissions.lineFilesRead', write: 'modulePermissions.lineFilesWrite' },
  },
  media: {
    icon: 'wave-sine',
    title: 'modulePermissions.mediaTitle',
    line: 'modulePermissions.lineMedia',
  },
  internet: {
    icon: 'world',
    title: 'modulePermissions.internetTitle',
    line: 'modulePermissions.lineInternet',
  },
  listen: {
    icon: 'access-point',
    title: 'modulePermissions.listenTitle',
    line: 'modulePermissions.lineListen',
  },
  lan: { icon: 'router', title: 'modulePermissions.lanTitle', line: 'modulePermissions.lineLan' },
  data: {
    icon: 'database',
    title: 'modulePermissions.dataTitle',
    line: { read: 'modulePermissions.lineDataRead', write: 'modulePermissions.lineDataWrite' },
  },
  settings: {
    icon: 'adjustments-horizontal',
    title: 'modulePermissions.settingsTitle',
    line: {
      read: 'modulePermissions.lineSettingsRead',
      write: 'modulePermissions.lineSettingsWrite',
    },
  },
};

/** The line an install dialog says a kind of access with: "Lire les comptes". */
export function lineKey(category: PermissionCategory, access: PermissionAccess | null): MessageKey {
  const { line } = CATEGORY_VIEW[category];
  return typeof line === 'string' ? line : line[access ?? 'read'];
}

export const ACCESS_TAG: Record<PermissionAccess, MessageKey> = {
  read: 'modulePermissions.tagRead',
  write: 'modulePermissions.tagWrite',
};

export const GLYPH_SIZE = 18;
