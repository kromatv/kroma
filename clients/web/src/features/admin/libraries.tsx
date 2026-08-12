import type { AdminLibrary } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  DataField,
  Divider,
  EmptyState,
  Grid,
  Icon,
  type IconName,
  Row,
  Surface,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import {
  AddLibraryModal,
  ManageLibraryModal,
  normalizeLibKind,
} from '#web/features/admin/libraries-modals';
import { Pill } from '#web/features/admin/pill';
import { Denied, PageHeader, useCap, usePoll } from '#web/features/admin/shell';
import { formatBytes, relativeSeen } from '#web/shared/lib/adminFormat';
import { useAuth } from '#web/shared/lib/auth';
import { TableSkeleton } from '#web/shared/ui';

const ICONS: Record<string, IconName> = {
  film: 'movie',
  tv: 'device-tv',
  music: 'music',
  photo: 'photo',
};

const KIND_LABEL = {
  '': 'admin.typeAuto',
  movies: 'admin.typeMovies',
  shows: 'admin.typeShows',
  mixed: 'admin.typeMixed',
} as const;

export function LibrariesScreen() {
  if (!useCap('library.manage')) return <Denied />;
  return <LibrariesPageInner />;
}

function LibrariesPageInner() {
  const t = useT();
  const { client } = useAuth();
  const { data, reload } = usePoll(['admin', 'libraries'], () => client.adminLibraries(), 8000);

  const openAdd = async () => {
    if (await AddLibraryModal.call()) reload();
  };
  const openManage = async (lib: AdminLibrary) => {
    if (await ManageLibraryModal.call({ lib })) reload();
  };

  const libraries = data?.libraries ?? [];

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.librariesTitle')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('admin.librariesSub')}</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Button
            variant="primary"
            icon="plus"
            label={t('admin.addLibrary')}
            onPress={() => void openAdd()}
          />
        </PageHeader.Actions>
      </PageHeader.Root>

      {data === null ? <TableSkeleton rows={4} /> : null}

      {libraries.length > 0 ? (
        <Box mt={24}>
          <Grid min={360} gap={16}>
            {libraries.map((l) => (
              <LibraryCard key={l.id} lib={l} onManage={() => void openManage(l)} />
            ))}
          </Grid>
        </Box>
      ) : null}
      {data && libraries.length === 0 ? (
        <EmptyState.Root icon="library">
          <EmptyState.Title>{t('admin.noLibraries')}</EmptyState.Title>
          <EmptyState.Actions>
            <Button
              variant="primary"
              icon="plus"
              label={t('admin.addLibrary')}
              onPress={() => void openAdd()}
            />
          </EmptyState.Actions>
        </EmptyState.Root>
      ) : null}
    </>
  );
}

function LibraryCard({
  lib,
  onManage,
}: Readonly<{
  lib: AdminLibrary;
  onManage: () => void;
}>) {
  const t = useT();
  const { client } = useAuth();
  const [scanning, setScanning] = useState(false);

  async function scan() {
    setScanning(true);
    try {
      await client.scanLibrary(lib.id);
    } finally {
      setTimeout(() => setScanning(false), 1200);
    }
  }

  const glyph = ICONS[lib.kind] ?? 'movie';

  return (
    <Surface elevated pad="none" radius="xl" border="border" overflow="hidden">
      <Row gap={14} px={20} py={18} bg="success/7">
        <Row center w={46} h={46} shrink={0} radius="lg" bg="success/16">
          <Icon name={glyph} size={22} stroke={1.8} color="success" />
        </Row>
        <Box flex minW={0}>
          <Text variant="title">{lib.name}</Text>
          <Text variant="meta" color="textDim">
            {t(KIND_LABEL[normalizeLibKind(lib.kind)])} ·{' '}
            {t('admin.itemsCount', { count: lib.itemCount })}
          </Text>
        </Box>
        {lib.autoScan ? (
          <Pill ink="success" bg="success/13">
            {t('admin.autoScanBadge')}
          </Pill>
        ) : null}
      </Row>
      <Divider color="tint/5" />

      <Box row align="stretch">
        <Stat label={t('admin.statSize')} value={formatBytes(lib.sizeBytes)} border />
        <Stat label={t('admin.statLastScan')} value={relativeSeen(lib.lastScan)} />
      </Box>
      <Divider color="tint/5" />

      <Box px={20} pt={14} pb={16}>
        <Text variant="overline" color="textDim" mb={8}>
          {t('admin.scannedFolders')}
        </Text>
        <Box gap={6}>
          {lib.folders.map((path) => (
            <Row key={path} gap={8}>
              <Icon name="folder" size={15} stroke={1.8} color="success" />
              <Text variant="meta" color="textMuted" lines={1} minW={0}>
                {path}
              </Text>
            </Row>
          ))}
          {lib.folders.length === 0 ? (
            <Text variant="meta" color="textDim">
              {t('admin.noFolders')}
            </Text>
          ) : null}
        </Box>
      </Box>
      <Divider color="tint/5" />

      <Row gap={10} px={20} py={14}>
        <Button
          size="sm"
          icon="refresh"
          label={scanning ? t('admin.scanning') : t('admin.scan')}
          onPress={() => void scan()}
          loading={scanning}
        />
        <Button variant="glass" size="sm" label={t('common.manage')} onPress={onManage} />
      </Row>
    </Surface>
  );
}

function Stat({
  label,
  value,
  border,
}: Readonly<{ label: string; value: string; border?: boolean }>) {
  return (
    <>
      <Box flex px={20} py={14}>
        <DataField.Root size="sm">
          <DataField.Label>{label}</DataField.Label>
          <DataField.Value>{value}</DataField.Value>
        </DataField.Root>
      </Box>
      {border ? <Divider vertical color="tint/5" /> : null}
    </>
  );
}
