import type { MessageKey } from '@kromatv/i18n';
import type { ModulePermissions } from '@kromatv/client/modules';

type Translate = (key: MessageKey, params?: Record<string, string>) => string;

/** One thing a module may do, in the operator's words. */
export interface PermissionLine {
  text: string;
  danger: boolean;
}

const ROOT_LABEL: Record<string, MessageKey> = {
  module: 'admin.permissionRootModule',
  media: 'admin.permissionRootMedia',
  downloads: 'admin.permissionRootDownloads',
  temp: 'admin.permissionRootTemp',
};

function destination(to: string, t: Translate): string {
  if (to === 'public') return t('admin.permissionToPublic');
  if (to === 'lan') return t('admin.permissionToLan');
  if (to.startsWith('setting:')) return t('admin.permissionToSetting');
  return to;
}

const unique = (items: string[]) => [...new Set(items)];

/** Every permission in `permissions`, the ones that reach past the component first. */
export function permissionLines(permissions: ModulePermissions, t: Translate): PermissionLine[] {
  const lines: PermissionLine[] = [];
  const say = (key: MessageKey, params?: Record<string, string>, danger = false) =>
    lines.push({ text: t(key, params), danger });
  const net = permissions.net;
  if (net?.host) say('admin.permissionHostNetwork', undefined, true);
  for (const connect of net?.connect ?? []) {
    say('admin.permissionConnect', {
      to: unique(connect.to.map((to) => destination(to, t))).join(', '),
      purpose: connect.purpose,
    });
  }
  if (net?.discovery?.length) say('admin.permissionDiscovery', { kinds: net.discovery.join(', ') });
  for (const listen of net?.listen ?? []) {
    say('admin.permissionListen', { purpose: listen.purpose });
  }
  const roots = (list: string[] | null | undefined) =>
    (list ?? []).map((root) => t(ROOT_LABEL[root] ?? 'admin.permissionRootModule')).join(', ');
  if (permissions.fs?.read?.length)
    say('admin.permissionRead', { roots: roots(permissions.fs.read) });
  if (permissions.fs?.write?.length) {
    say('admin.permissionWrite', { roots: roots(permissions.fs.write) });
  }
  if (permissions.run?.length) say('admin.permissionRun', { programs: permissions.run.join(', ') });
  if (permissions.env?.length) say('admin.permissionEnv', { names: permissions.env.join(', ') });
  return lines;
}
