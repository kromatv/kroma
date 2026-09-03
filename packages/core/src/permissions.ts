// The single source of truth for the capability picker: every grantable
// permission with its i18n label + hint. Clients render from this array, so
// adding a permission is a one-line change here (plus its two i18n keys and
// the server-side enum) rather than editing every invite / user-edit screen.

import type { Permission } from '@kroma/client/accounts';
import type { MessageKey } from './i18n';

export interface PermissionMeta {
  key: Permission;
  labelKey: MessageKey;
  hintKey: MessageKey;
}

/** All grantable permissions, in display order. Keep in sync with the Rust
 * `Permission` enum (`server/src/domain/accounts.rs`). */
export const PERMISSIONS: readonly PermissionMeta[] = [
  { key: 'playback', labelKey: 'permissions.playback', hintKey: 'permissions.playbackHint' },
  { key: 'library.manage', labelKey: 'permissions.library', hintKey: 'permissions.libraryHint' },
  { key: 'users.manage', labelKey: 'permissions.users', hintKey: 'permissions.usersHint' },
  { key: 'settings.manage', labelKey: 'permissions.settings', hintKey: 'permissions.settingsHint' },
  {
    key: 'requests.create',
    labelKey: 'permissions.requestCreate',
    hintKey: 'permissions.requestCreateHint',
  },
  {
    key: 'requests.manage',
    labelKey: 'permissions.requestManage',
    hintKey: 'permissions.requestManageHint',
  },
  {
    key: 'requests.auto',
    labelKey: 'permissions.requestAuto',
    hintKey: 'permissions.requestAutoHint',
  },
  {
    key: 'reports.manage',
    labelKey: 'permissions.reportsManage',
    hintKey: 'permissions.reportsManageHint',
  },
];
