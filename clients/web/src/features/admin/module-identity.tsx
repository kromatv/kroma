import type { StoreModule } from '@kromatv/client/modules';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Row, Surface, Text } from '@kromatv/ui/kit';
import type { ReactNode } from 'react';
import type { AdminModule } from '#web/features/admin/module-api';
import { HeaderIcon } from '#web/features/admin/module-detail-sections.component';
import { readableRange, useNewestText, useRefusalText } from '#web/features/admin/module-refusal';
import { Pill } from '#web/features/admin/pill.component';

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
  const incompatible = useRefusalText(entry);
  const newest = useNewestText(entry);
  return (
    <>
      {failure ? (
        <Text variant="meta" color="danger">
          {failure}
        </Text>
      ) : null}
      {incompatible ? (
        <Text variant="meta" color={entry?.updateBlocked ? 'textDim' : 'danger'}>
          {incompatible}
        </Text>
      ) : null}
      {newest ? (
        <Text variant="meta" color="textDim">
          {newest}
        </Text>
      ) : null}
    </>
  );
}

type Said = Pick<AdminModule | StoreModule, 'name' | 'version' | 'description' | 'translations'>;

const present = <T,>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

function said<K extends keyof Said>(sources: readonly Said[], key: K) {
  return sources.map((source) => source[key]).find(present);
}

/** How a module is named and described: by the manifest the server holds,
 *  then by the catalog row, word by word, and by its id when neither knows it. */
export function identityOf(
  id: string,
  installed: AdminModule | undefined,
  entry: StoreModule | undefined,
) {
  const sources = [installed, entry].filter(present);
  return {
    name: said(sources, 'name') ?? id,
    version: said(sources, 'version'),
    description: said(sources, 'description') ?? '',
    translations: said(sources, 'translations'),
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
  if (entry?.source) {
    rows.push([t('admin.modulesSource'), entry.source]);
  }
  const engines = entry?.engines ?? installed?.engines ?? {};
  for (const [engine, range] of Object.entries(engines)) {
    rows.push([engine === 'server' ? t('admin.modulesMinServer') : engine, readableRange(range)]);
  }
  return rows;
}
