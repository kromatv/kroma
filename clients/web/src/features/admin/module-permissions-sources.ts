import type { DeclaredAccess, StoreCatalog, StoreModule } from '@kromatv/client/modules';
import type { AdminModule } from '#web/features/admin/module-api';
import type {
  Access,
  ModuleAccess,
  PermissionSource,
} from '#web/features/admin/module-permissions';

type List<T> = readonly T[] | null | undefined;

const union = <T>(lists: readonly List<T>[]): T[] => [
  ...new Set(lists.flatMap((list) => list ?? [])),
];

const added = <T>(next: List<T>, before: List<T>): T[] =>
  (next ?? []).filter((item) => !(before ?? []).includes(item));

function addedEntries<T>(next: List<T>, before: List<T>): T[] {
  const seen = new Set((before ?? []).map((entry) => JSON.stringify(entry)));
  return (next ?? []).filter((entry) => !seen.has(JSON.stringify(entry)));
}

const accessOf = (
  sources: readonly PermissionSource[],
  pick: (s: PermissionSource) => Access | null | undefined,
) => ({
  read: union(sources.map((source) => pick(source)?.read)),
  write: union(sources.map((source) => pick(source)?.write)),
});

/** What an installed module declares, or null when it does not say what it may do. */
export function installedSource(module: AdminModule): PermissionSource | null {
  if (!module.permissions) return null;
  return {
    permissions: module.permissions,
    storage: module.storage,
    settings: module.settings,
    helpers: module.helpers ?? {},
    official: module.origin?.official ?? false,
  };
}

/** Whether a catalog row comes from the official registry: the row names the
 *  registry it came from, and the catalog says which registry is official. */
export function fromOfficialRegistry(catalog: StoreCatalog, entry: StoreModule): boolean {
  return (
    entry.official ||
    catalog.registries.some((registry) => registry.official && registry.name === entry.source)
  );
}

/** What a catalog row, a plan row or an uploaded bundle declares: null when it
 *  does not say what the module may do. */
export function declaredSource(
  declared: DeclaredAccess & { official?: boolean },
): PermissionSource | null {
  const { permissions, storage, settings, helpers, official } = declared;
  return permissions
    ? { permissions, storage, settings, helpers, official: official ?? false }
    : null;
}

/** Everything several modules declare, as if one module declared it all. */
export function mergeSources(sources: readonly PermissionSource[]): PermissionSource {
  const declared = sources.map((source) => source.permissions);
  return {
    permissions: {
      net: {
        connect: declared.flatMap((one) => one.net?.connect ?? []),
        listen: declared.flatMap((one) => one.net?.listen ?? []),
        discovery: union(declared.map((one) => one.net?.discovery)),
        host: declared.some((one) => one.net?.host),
      },
      fs: {
        read: union(declared.map((one) => one.fs?.read)),
        write: union(declared.map((one) => one.fs?.write)),
      },
      run: union(declared.map((one) => one.run)),
      env: union(declared.map((one) => one.env)),
    },
    storage: { core: accessOf(sources, (source) => source.storage?.core) },
    settings: accessOf(sources, (source) => source.settings),
  };
}

/** What `next` declares that `before` did not: what an update asks for on top
 *  of the version installed. */
export function addedAccess(next: PermissionSource, before: PermissionSource): PermissionSource {
  const now = next.permissions;
  const was = before.permissions;
  const core = { next: next.storage?.core, before: before.storage?.core };
  return {
    permissions: {
      net: {
        connect: addedEntries(now.net?.connect, was.net?.connect),
        listen: addedEntries(now.net?.listen, was.net?.listen),
        discovery: added(now.net?.discovery, was.net?.discovery),
        host: Boolean(now.net?.host && !was.net?.host),
      },
      fs: { read: added(now.fs?.read, was.fs?.read), write: added(now.fs?.write, was.fs?.write) },
      run: added(now.run, was.run),
      env: added(now.env, was.env),
    },
    storage: {
      core: {
        read: added(core.next?.read, core.before?.read),
        write: added(core.next?.write, core.before?.write),
      },
    },
    settings: {
      read: added(next.settings?.read, before.settings?.read),
      write: added(next.settings?.write, before.settings?.write),
    },
    helpers: next.helpers,
    official: next.official,
  };
}

interface ConsentRow extends DeclaredAccess {
  id: string;
  name: string;
  official?: boolean;
  installedVersion?: string | null;
}

/** The modules an install asks the operator to accept, the one asked for
 *  first. `sheet` is everything each declares; `entries` is what each brings,
 *  which for a module already installed is only what this version adds.
 *  `updating` says the module asked for is one of those. */
export function consentOf(
  rows: readonly ConsentRow[],
  requested: string,
  installed: readonly AdminModule[],
) {
  const ordered = [
    ...rows.filter((row) => row.id === requested),
    ...rows.filter((row) => row.id !== requested),
  ];
  const sheet: ModuleAccess[] = ordered.map(({ id, name, ...row }) => ({
    id,
    name,
    source: declaredSource(row),
  }));
  const entries = sheet.map((module, at): ModuleAccess => {
    const current = ordered[at]?.installedVersion
      ? installed.find((one) => one.id === module.id)
      : undefined;
    const before = current ? installedSource(current) : null;
    if (!before || !module.source) return module;
    return { ...module, source: addedAccess(module.source, before) };
  });
  return {
    sheet,
    entries,
    updating: Boolean(rows.find((row) => row.id === requested)?.installedVersion),
    unofficial: rows.filter((row) => !row.official).length,
  };
}
