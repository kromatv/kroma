// The Installed tab of the Modules page: one row per module on this server
// (compiled-in and runtime-installed alike) with its enable toggle, update
// chip and a chevron into the detail drawer. Configuration, dependencies and
// uninstall live in the drawer, so the list stays scannable.

import type { StoreCatalog } from '@kroma/core';
import { moduleIconUrl } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Badge, Box, EmptyState, IconButton, Row, Switch, Text } from '@kroma/ui/kit';
import { type AdminModule, matchesQuery } from '#web/features/admin/module-api';
import { useModuleToggle } from '#web/features/admin/module-data';
import { Pill } from '#web/features/admin/pill';
import { Table } from '#web/features/admin/table';
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
    <>
      <Table.Row>
        <Table.Cell row gap={14}>
          <Box w={36} h={36} shrink={0} radius="sm" overflow="hidden">
            <Image src={moduleIconUrl(m.id, apiBase())} fit="cover" fill />
          </Box>
          <Box minW={0}>
            <Row gap={8}>
              <Text variant="label" lines={1}>
                {m.name}
              </Text>
              {update && (
                <Pill ink="accentText" bg="accentSoft" variant="overline">
                  {t('admin.modulesUpdateChip', { version: update })}
                </Pill>
              )}
            </Row>
            <Text variant="meta" color="textDim" lines={1}>
              {m.id} · v{m.version}
            </Text>
          </Box>
        </Table.Cell>
        <Table.Cell wide row wrap gap={6}>
          {provides.slice(0, 3).map((c) => (
            <Badge key={`${c.kind}:${c.id}`} tone="neutral">
              {c.kind}:{c.id}
            </Badge>
          ))}
        </Table.Cell>
        <Table.Cell row gap={8}>
          <Text variant="meta" color="textDim">
            {m.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
          </Text>
          <Switch
            checked={m.enabled}
            onCheckedChange={busy ? undefined : (v) => void toggle(v)}
            label={m.name}
          />
        </Table.Cell>
        <Table.Cell row justify="flex-end">
          <IconButton
            variant="ghost"
            icon="chevron-right"
            label={t('admin.modulesDetails')}
            onPress={onOpen}
          />
        </Table.Cell>
      </Table.Row>
      {error && (
        <Box px={20} pb={12}>
          <Text variant="meta" color="danger">
            {error}
          </Text>
        </Box>
      )}
    </>
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
      <EmptyState.Root icon="apps">
        <EmptyState.Title>{t('admin.modulesInstalledEmpty')}</EmptyState.Title>
        <EmptyState.Hint>{t('admin.modulesInstalledEmptyHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }
  if (modules && shown.length === 0) {
    return (
      <EmptyState.Root icon="search">
        <EmptyState.Title>
          {t('admin.modulesEmptySearch', { query: query.trim() })}
        </EmptyState.Title>
      </EmptyState.Root>
    );
  }
  return (
    <Table.Root columns="2.4fr 1.4fr auto 44px" narrow="minmax(0, 1fr) auto 44px">
      {shown.map((m) => (
        <InstalledRow
          key={m.id}
          m={m}
          update={updateById.get(m.id)}
          onOpen={() => onOpen(m.id)}
          onChanged={onChanged}
        />
      ))}
    </Table.Root>
  );
}
