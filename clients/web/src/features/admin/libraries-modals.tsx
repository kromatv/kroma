import type { AdminLibrary } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Button,
  confirm,
  Dialog,
  Field,
  Row,
  SegmentGroup,
  Switch,
  Text,
} from '@kroma/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { FolderField, FolderListEditor } from '#web/features/admin/folder-field';
import { useAsyncAction } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

/** Library kind as accepted by the create/update API: `""` = Auto. */
export type LibKind = '' | 'movies' | 'shows' | 'mixed';

/** Accepts both the legacy `film`/`tv` kinds and the current `movies`/`shows`. */
export function normalizeLibKind(kind: string): LibKind {
  if (kind === 'shows' || kind === 'tv') return 'shows';
  if (kind === 'movies' || kind === 'film') return 'movies';
  if (kind === 'mixed') return 'mixed';
  return '';
}

export function LibraryTypeSelect({
  value,
  onChange,
}: Readonly<{ value: LibKind; onChange: (v: LibKind) => void }>) {
  const t = useT();
  return (
    <SegmentGroup.Root<LibKind> value={value} onValueChange={onChange}>
      <SegmentGroup.Item value="">
        <SegmentGroup.Label>{t('admin.typeAuto')}</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="movies">
        <SegmentGroup.Label>{t('admin.typeMovies')}</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="shows">
        <SegmentGroup.Label>{t('admin.typeShows')}</SegmentGroup.Label>
      </SegmentGroup.Item>
      <SegmentGroup.Item value="mixed">
        <SegmentGroup.Label>{t('admin.typeMixed')}</SegmentGroup.Label>
      </SegmentGroup.Item>
    </SegmentGroup.Root>
  );
}

export const AddLibraryModal = createCallable<void, boolean>(({ call }) => {
  const t = useT();
  const { client } = useAuth();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LibKind>('');
  const [folder, setFolder] = useState('');
  const { busy, run } = useAsyncAction();

  const create = () => {
    if (!name.trim()) return;
    run(async () => {
      await client.createLibrary({
        name: name.trim(),
        kind,
        folders: folder.trim() ? [folder.trim()] : [],
      });
      call.end(true);
    });
  };

  return (
    <Dialog.Root open title={t('admin.addLibrary')} width="md" onClose={() => call.end(false)}>
      <Field.Root label={t('admin.name')}>
        <Field.Input
          icon="tag"
          value={name}
          onValueChange={setName}
          placeholder={t('admin.kindMovies')}
        />
      </Field.Root>
      <Field.Root label={t('admin.libraryType')}>
        <LibraryTypeSelect value={kind} onChange={setKind} />
      </Field.Root>
      <Field.Root label={t('admin.firstFolder')}>
        <FolderField
          value={folder}
          onChange={setFolder}
          placeholder={t('admin.chooseFolder')}
          onClear={() => setFolder('')}
        />
      </Field.Root>
      <Dialog.Footer>
        <Dialog.Actions
          onCancel={() => call.end(false)}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            create();
          }}
          confirmLabel={busy ? t('common.creating') : t('common.create')}
          busy={busy}
          disabled={!name.trim()}
        />
      </Dialog.Footer>
    </Dialog.Root>
  );
});

export const ManageLibraryModal = createCallable<{ lib: AdminLibrary }, boolean>(
  ({ call, lib }) => {
    const t = useT();
    const { client } = useAuth();
    const [name, setName] = useState(lib.name);
    const [kind, setKind] = useState<LibKind>(() => normalizeLibKind(lib.kind));
    const [folders, setFolders] = useState(lib.folders);
    const [autoScan, setAutoScan] = useState(lib.autoScan);
    const { busy, run } = useAsyncAction();

    const save = () =>
      run(async () => {
        await client.updateLibrary(lib.id, { name: name.trim(), kind, folders, autoScan });
        call.end(true);
      });
    const remove = async () => {
      const ok = await confirm({
        title: t('common.delete'),
        message: t('admin.confirmDeleteLibrary', { name: lib.name }),
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!ok) return;
      run(async () => {
        await client.deleteLibrary(lib.id);
        call.end(true);
      });
    };

    return (
      <Dialog.Root
        open
        title={t('admin.manageLibrary', { name: lib.name })}
        width="lg"
        onClose={() => call.end(false)}
      >
        <Field.Root label={t('admin.name')}>
          <Field.Input icon="tag" value={name} onValueChange={setName} />
        </Field.Root>
        <Field.Root label={t('admin.libraryType')}>
          <LibraryTypeSelect value={kind} onChange={setKind} />
        </Field.Root>
        <Field.Root label={t('admin.scannedFolders')}>
          <FolderListEditor folders={folders} onChange={setFolders} />
        </Field.Root>
        <Row between gap={16}>
          <Box>
            <Text variant="label">{t('admin.autoScan')}</Text>
            <Text variant="meta" color="textDim" mt={2}>
              {t('admin.autoScanHint')}
            </Text>
          </Box>
          <Switch checked={autoScan} onCheckedChange={setAutoScan} label={t('admin.autoScan')} />
        </Row>
        <Dialog.Footer>
          <Dialog.Actions
            onCancel={() => call.end(false)}
            cancelLabel={t('common.cancel')}
            onConfirm={() => {
              save();
            }}
            confirmLabel={busy ? t('common.saving') : t('common.save')}
            busy={busy}
            disabled={!name.trim()}
          >
            <Button
              variant="dangerGhost"
              size="sm"
              label={t('common.delete')}
              onPress={() => {
                void remove();
              }}
              disabled={busy}
            />
          </Dialog.Actions>
        </Dialog.Footer>
      </Dialog.Root>
    );
  },
);
