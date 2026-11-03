import type { ModulePermissions } from '@kromatv/client/modules';
import type { MessageKey, Translate } from '@kromatv/i18n';
import {
  internetGroup,
  lanGroup,
  listenGroup,
} from '#web/features/admin/module-permissions-network';
import {
  accountsGroup,
  dataGroup,
  settingsGroup,
} from '#web/features/admin/module-permissions-stores';
import { accessWord, listOf, opening } from '#web/features/admin/module-permissions-words';

export type PermissionCategory =
  | 'run'
  | 'host'
  | 'accounts'
  | 'files'
  | 'media'
  | 'internet'
  | 'listen'
  | 'lan'
  | 'data'
  | 'settings';

export type PermissionAccess = 'read' | 'write';

export interface PermissionDetail {
  text: string;
  hint?: string;
}

/** One kind of access a module has: a sentence for the sheet, a few words for a
 *  tile, and its particulars. `extended` marks what reaches past the module's
 *  isolation: a program the host runs and the host's own network. `access` is
 *  null where reading and changing do not apply. */
export interface PermissionGroup {
  category: PermissionCategory;
  summary: string;
  brief: string;
  details: PermissionDetail[];
  extended: boolean;
  access: PermissionAccess | null;
}

export interface Access {
  read?: readonly string[] | null;
  write?: readonly string[] | null;
}

/** What a module declares, and whether the official registry ships it. A catalog
 *  row carries `permissions` alone, so the groups drawn from the rest appear once
 *  the module is installed. */
export interface PermissionSource {
  permissions: ModulePermissions;
  storage?: { core?: Access | null } | null;
  settings?: Access | null;
  helpers?: Readonly<Record<string, unknown>> | null;
  official?: boolean;
}

/** One module and what it declares: null when it does not say what it may do. */
export interface ModuleAccess {
  id: string;
  name: string;
  source: PermissionSource | null;
}

const SHARED_ROOTS = ['media', 'downloads'] as const;
type SharedRoot = (typeof SHARED_ROOTS)[number];
const ROOT_WORD: Record<SharedRoot, MessageKey> = {
  media: 'modulePermissions.rootMedia',
  downloads: 'modulePermissions.rootDownloads',
};
const ROOT_NOUN: Record<SharedRoot, MessageKey> = {
  media: 'modulePermissions.rootMediaNoun',
  downloads: 'modulePermissions.rootDownloadsNoun',
};

function extendedGroup(
  category: PermissionCategory,
  summary: string,
  details: PermissionDetail[] = [],
  access: PermissionAccess | null = null,
): PermissionGroup {
  return { category, summary, brief: summary, details, extended: true, access };
}

function runGroup(source: PermissionSource, t: Translate): PermissionGroup | null {
  const programs = source.permissions.run ?? [];
  if (programs.length === 0) return null;
  const { helpers } = source;
  const origin = (name: string) =>
    t(
      helpers && name in helpers
        ? 'modulePermissions.programPinned'
        : 'modulePermissions.programServer',
    );
  return extendedGroup(
    'run',
    t('modulePermissions.runSummary', { programs: listOf(programs, t) }),
    helpers ? programs.map((name) => ({ text: name, hint: origin(name) })) : [],
  );
}

function filesGroup(fs: ModulePermissions['fs'], t: Translate): PermissionGroup | null {
  const reads = SHARED_ROOTS.filter((root) => fs?.read?.includes(root));
  const writes = SHARED_ROOTS.filter((root) => fs?.write?.includes(root));
  const touched = SHARED_ROOTS.filter((root) => reads.includes(root) || writes.includes(root));
  if (touched.length === 0) return null;
  const readOnly = reads.filter((root) => !writes.includes(root));
  const words = (roots: readonly SharedRoot[]) =>
    listOf(
      roots.map((root) => t(ROOT_WORD[root])),
      t,
    );
  let summary = t('modulePermissions.filesRead', { roots: words(reads) });
  if (writes.length > 0 && readOnly.length > 0) {
    summary = t('modulePermissions.filesChangeRead', {
      changed: words(writes),
      read: words(readOnly),
    });
  } else if (writes.length > 0) {
    summary = t('modulePermissions.filesChange', { roots: words(writes) });
  }
  return {
    category: 'files',
    summary,
    brief: opening(
      listOf(
        touched.map((root) => t(ROOT_NOUN[root])),
        t,
      ),
    ),
    details: touched.map((root) => ({
      text: opening(t(ROOT_WORD[root])),
      hint: accessWord(reads.includes(root), writes.includes(root), t),
    })),
    extended: false,
    access: writes.length > 0 ? 'write' : 'read',
  };
}

function mediaGroup(media: ModulePermissions['media'], t: Translate): PermissionGroup | null {
  if (!media?.includes('decode')) return null;
  return {
    category: 'media',
    summary: t('modulePermissions.mediaSummary'),
    brief: t('modulePermissions.mediaBrief'),
    details: [],
    extended: false,
    access: null,
  };
}

/** Every kind of access `source` declares, most consequential first: what
 *  reaches past the module's isolation, then the data about people, the files,
 *  the audio the server decodes for it, the internet, what may reach in, the local network, the server's data and
 *  its settings. */
export function permissionGroups(source: PermissionSource, t: Translate): PermissionGroup[] {
  const { permissions } = source;
  const net = permissions.net;
  const core = source.storage?.core;
  return [
    runGroup(source, t),
    net?.host ? extendedGroup('host', t('modulePermissions.hostSummary')) : null,
    accountsGroup(core, t),
    filesGroup(permissions.fs, t),
    mediaGroup(permissions.media, t),
    internetGroup(net?.connect ?? [], t),
    listenGroup(net?.listen ?? [], t),
    lanGroup(net, t),
    dataGroup(core, t),
    settingsGroup(source.settings, permissions.env, t),
  ].filter((group) => group !== null);
}

const TILES_SHOWN = 4;

/** The kinds of access a module page shows as tiles: the weightiest of those
 *  that stay inside the module's isolation. */
export function tileGroups(groups: readonly PermissionGroup[]): PermissionGroup[] {
  return groups.filter((group) => !group.extended).slice(0, TILES_SHOWN);
}
