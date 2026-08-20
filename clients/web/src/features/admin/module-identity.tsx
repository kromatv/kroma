import type { MessageKey, StoreModule } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Row, Surface, Text } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import type { AdminModule } from '#web/features/admin/module-api';
import { HeaderIcon } from '#web/features/admin/module-detail-sections';
import { Pill } from '#web/features/admin/pill';

export function IdentityCard({
  id,
  installed,
  entry,
  update,
  description,
}: Readonly<{
  id: string;
  installed: AdminModule | undefined;
  entry: StoreModule | undefined;
  update: boolean;
  description: string;
}>) {
  const t = useT();
  return (
    <Surface elevated radius="xl" pad="lg" gap={16}>
      <HeaderIcon id={id} installed={!!installed} icon={entry?.icon} />
      <Row wrap gap={6}>
        {entry?.library && (
          <Pill ink="textMuted" bg="tint/6" variant="overline">
            {t('admin.modulesLibraryChip')}
          </Pill>
        )}
        {installed && (
          <Pill
            ink={installed.enabled ? 'success' : 'textDim'}
            bg={installed.enabled ? 'success/14' : 'tint/6'}
            variant="overline"
          >
            {installed.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
          </Pill>
        )}
        {update && entry && (
          <Pill ink="accentText" bg="accentSoft" variant="overline">
            {t('admin.modulesUpdateChip', { version: entry.version })}
          </Pill>
        )}
      </Row>
      {description ? (
        <Text variant="meta" color="textMuted">
          {description}
        </Text>
      ) : null}
    </Surface>
  );
}

export function Problems({
  failure,
  entry,
}: Readonly<{ failure: string | null | undefined; entry: StoreModule | undefined }>) {
  const incompatible = entry && !entry.compatible ? entry.reason : null;
  return (
    <>
      {failure ? (
        <Text variant="meta" color="danger">
          {failure}
        </Text>
      ) : null}
      {incompatible ? (
        <Text variant="meta" color="danger">
          {incompatible}
        </Text>
      ) : null}
    </>
  );
}

export function identityOf(
  id: string,
  installed: AdminModule | undefined,
  entry: StoreModule | undefined,
) {
  return {
    name: installed?.name ?? entry?.name ?? id,
    version: installed?.version ?? entry?.version,
    description: installed?.description ?? entry?.description ?? '',
  };
}

export function metaRowsFor(
  t: (key: MessageKey) => string,
  installed: AdminModule | undefined,
  entry: StoreModule | undefined,
  update: boolean,
  version: string | undefined,
): [string, ReactNode][] {
  const rows: [string, ReactNode][] = [
    [
      t('admin.modulesVersion'),
      update ? (
        <>
          v{installed?.version} <Text color="accentText">→ v{entry?.version}</Text>
        </>
      ) : (
        `v${version ?? '?'}`
      ),
    ],
  ];
  if (entry?.source) rows.push([t('admin.modulesSource'), entry.source]);
  const engines = entry?.engines ?? installed?.engines ?? {};
  for (const [engine, range] of Object.entries(engines)) {
    rows.push([engine === 'server' ? t('admin.modulesMinServer') : engine, range]);
  }
  if (entry?.target) rows.push([t('admin.modulesPlatform'), entry.target]);
  return rows;
}
