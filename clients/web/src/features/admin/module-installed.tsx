// The Installed tab of the Modules page: one row per module on this server
// (compiled-in and runtime-installed alike) with its enable toggle, update
// chip and a chevron into the detail drawer. Configuration, dependencies and
// uninstall live in the drawer, so the list stays scannable.

import type { MessageKey, StoreCatalog } from '@kroma/core';
import { moduleIconUrl, Table } from '@kroma/module-sdk';
import { useT } from '@kroma/ui';
import { Badge, Box, EmptyState, Icon, Row, Switch, Text, Tooltip } from '@kroma/ui/kit';
import { type AdminModule, type ModuleOrigin, matchesQuery } from '#web/features/admin/module-api';
import { useModuleToggle } from '#web/features/admin/module-data';
import { Pill } from '#web/features/admin/pill';
import { apiBase } from '#web/shared/lib/api';
import { Image } from '#web/shared/ui';

const SOURCE_KEY = {
  registry: 'admin.modulesSourceRegistry',
  upload: 'admin.modulesSourceUpload',
  url: 'admin.modulesSourceUrl',
  unknown: 'admin.modulesSourceUnknown',
} as const satisfies Record<ModuleOrigin['kind'], MessageKey>;

// The local half of the point plus the instance, when there is one:
// `tv.kroma.torrents/download-client` + `rqbit` reads as `download-client:rqbit`.
function pointLabel(c: { point: string; id?: string | null }): string {
  const local = c.point.split('/').pop() ?? c.point;
  return c.id ? `${local}:${c.id}` : local;
}

function sourceKey(origin: ModuleOrigin | undefined): MessageKey {
  return origin ? SOURCE_KEY[origin.kind] : 'admin.modulesSourceBuiltIn';
}

// The label takes the cell's free space and right-aligns inside it: a longer
// word ("Desactive") then grows leftwards instead of pushing the switch, so both
// columns line up down the list whatever each row says.
const STATE_LABEL = { flex: 1, textAlign: 'right' } as const;

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
  const answers = m.contributes ?? [];
  const localBuild = m.origin?.localBuild === true;
  // Only a module that HAS a process can be stopped. A library module is code
  // co-linked into another sidecar, so "not running" is its normal state.
  const stalled = m.enabled && m.hasSidecar && !m.running;
  // Running but useless: something it needs is not installed or is switched off.
  // Only worth saying while it is enabled, since a disabled module is inert by
  // choice.
  const unmet = m.enabled ? (m.unmet ?? []) : [];
  const stateKey = m.enabled ? 'admin.modulesEnabled' : 'admin.modulesDisabled';
  const source = localBuild || m.origin?.kind === 'unknown' ? null : t(sourceKey(m.origin));
  return (
    <>
      <Table.Row onPress={onOpen}>
        <Table.Cell row align="center" gap={14}>
          <Box w={36} h={36} shrink={0} radius="sm" overflow="hidden">
            <Image src={moduleIconUrl(m.id, apiBase())} fit="cover" fill />
          </Box>
          <Box minW={0}>
            <Row gap={8}>
              <Text variant="label" lines={1}>
                {m.name}
              </Text>
              {localBuild && (
                <Tooltip label={t('admin.modulesLocalBuildHint')}>
                  <Pill ink="danger" bg="danger/13" variant="overline">
                    {t('admin.modulesLocalBuild')}
                  </Pill>
                </Tooltip>
              )}
              {update && (
                <Pill ink="accentText" bg="accentSoft" variant="overline">
                  {t('admin.modulesUpdateChip', { version: update })}
                </Pill>
              )}
              {unmet.length > 0 && (
                <Tooltip label={t('admin.modulesUnmetHint', { needs: unmet.join(', ') })}>
                  <Pill ink="danger" bg="danger/13" variant="overline">
                    {t('admin.modulesUnmet')}
                  </Pill>
                </Tooltip>
              )}
            </Row>
            <Text variant="meta" color="textDim" lines={1}>
              {m.id} · v{m.version}
              {source ? ` · ${source}` : ''}
            </Text>
          </Box>
        </Table.Cell>
        <Table.Cell wide row wrap align="center" gap={6} justify="flex-end">
          {answers.slice(0, 3).map((c) => (
            <Badge key={`${c.point}:${c.id ?? ''}`} tone="neutral">
              {pointLabel(c)}
            </Badge>
          ))}
        </Table.Cell>
        <Table.Cell row align="center" gap={8} justify="flex-end">
          <Text variant="meta" color={stalled ? 'danger' : 'textDim'} style={STATE_LABEL}>
            {t(stalled ? 'admin.modulesNotRunning' : stateKey)}
          </Text>
          <Switch
            checked={m.enabled}
            onCheckedChange={busy ? undefined : (v) => void toggle(v)}
            label={m.name}
          />
        </Table.Cell>
        <Table.Cell row align="center" justify="flex-end">
          <Icon name="chevron-right" size={16} thickness={2.2} color="textDim" />
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
    <Table.Root columns="minmax(0, 1fr) 260px 132px 44px" narrow="minmax(0, 1fr) auto 44px">
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
