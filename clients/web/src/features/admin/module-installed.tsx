// The Installed tab of the Modules page: one row per module on this server
// (compiled-in and runtime-installed alike) with its enable toggle, update
// chip and a chevron into the detail drawer. Configuration, dependencies and
// uninstall live in the drawer, so the list stays scannable.

import type { StoreCatalog } from '@kroma/core';
import { moduleIconUrl } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { EmptyState, IconButton, Surface, Switch } from '@kroma/ui/kit';
import { type AdminModule, matchesQuery } from '#web/features/admin/module-api';
import { useModuleToggle } from '#web/features/admin/module-data';
import { apiBase } from '#web/shared/lib/api';
import { Image } from '#web/shared/ui';

function InstalledRow({
  m,
  update,
  onOpen,
  onChanged,
}: Readonly<{
  m: AdminModule;
  update: string | undefined;
  onOpen: () => void;
  onChanged: () => void;
}>) {
  const t = useT();
  const { busy, error, toggle } = useModuleToggle(m.id, onChanged);
  const provides = m.provides ?? [];
  return (
    <div className="border-b border-white/4 px-5 py-3.5 last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_44px] items-center gap-4 md:grid-cols-[2.4fr_1.4fr_auto_44px]">
        <div className="flex min-w-0 items-center gap-3.5">
          <Image
            src={moduleIconUrl(m.id, apiBase())}
            fit="cover"
            className="h-9 w-9 shrink-0 rounded-lg"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-bold text-text">{m.name}</span>
              {update && (
                <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                  {t('admin.modulesUpdateChip', { version: update })}
                </span>
              )}
            </div>
            <div className="truncate text-[12px] font-medium text-dim">
              {m.id} · v{m.version}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 max-md:hidden">
          {provides.slice(0, 3).map((c) => (
            <span
              key={`${c.kind}:${c.id}`}
              className="rounded bg-white/5 px-2 py-0.5 text-[10.5px] text-muted"
            >
              {c.kind}:{c.id}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-dim max-md:hidden">
            {m.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
          </span>
          <Switch
            checked={m.enabled}
            onChange={busy ? undefined : (v) => void toggle(v)}
            label={m.name}
          />
        </div>
        <div className="flex justify-end">
          <IconButton
            variant="ghost"
            icon="chevron-right"
            label={t('admin.modulesDetails')}
            onPress={onOpen}
          />
        </div>
      </div>
      {error && <p className="mt-1.5 text-[11px] font-semibold text-danger">{error}</p>}
    </div>
  );
}

export function InstalledList({
  modules,
  catalog,
  query,
  onOpen,
  onChanged,
}: Readonly<{
  modules: AdminModule[] | null | undefined;
  catalog: StoreCatalog | null | undefined;
  query: string;
  onOpen: (id: string) => void;
  onChanged: () => void;
}>) {
  const t = useT();
  const all = modules ?? [];
  const updateById = new Map(
    (catalog?.modules ?? [])
      .filter((m) => m.updateAvailable && m.compatible)
      .map((m) => [m.id, m.version]),
  );
  const shown = all.filter((m) => matchesQuery(m, query));
  if (modules && all.length === 0) {
    return (
      <EmptyState.Root
        icon="apps"
        title={t('admin.modulesInstalledEmpty')}
        hint={t('admin.modulesInstalledEmptyHint')}
      />
    );
  }
  if (modules && shown.length === 0) {
    return (
      <EmptyState.Root
        icon="search"
        title={t('admin.modulesEmptySearch', { query: query.trim() })}
      />
    );
  }
  return (
    <Surface elevated pad="none" radius={16} overflow="hidden">
      {shown.map((m) => (
        <InstalledRow
          key={m.id}
          m={m}
          update={updateById.get(m.id)}
          onOpen={() => onOpen(m.id)}
          onChanged={onChanged}
        />
      ))}
    </Surface>
  );
}
