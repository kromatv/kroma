import type { AdminLibrary } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, confirm, Dialog, Field, SegmentedControl, Switch } from '@kroma/ui/kit';
import { useState } from 'react';
import { createCallable } from 'react-call';
import { FolderField } from '#web/features/admin/folder-picker';
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
    <SegmentedControl.Root<LibKind>
      value={value}
      onValueChange={onChange}
      options={[
        { value: '', label: t('admin.typeAuto') },
        { value: 'movies', label: t('admin.typeMovies') },
        { value: 'shows', label: t('admin.typeShows') },
        { value: 'mixed', label: t('admin.typeMixed') },
      ]}
    />
  );
}

function FolderListEditor({
  folders,
  onChange,
}: Readonly<{ folders: string[]; onChange: (folders: string[]) => void }>) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      {folders.map((path) => (
        <FolderField
          key={path}
          value={path}
          placeholder={t('admin.addFolder')}
          onChange={(next) => onChange(folders.map((p) => (p === path ? next : p)))}
          onClear={() => onChange(folders.filter((p) => p !== path))}
        />
      ))}
      <FolderField
        value=""
        placeholder={t('admin.addFolder')}
        onChange={(path) => {
          if (!folders.includes(path)) onChange([...folders, path]);
        }}
      />
    </div>
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
    <Dialog open title={t('admin.addLibrary')} width={600} onClose={() => call.end(false)}>
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
    </Dialog>
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
      <Dialog
        open
        title={t('admin.manageLibrary', { name: lib.name })}
        width={600}
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[14px] font-bold">{t('admin.autoScan')}</div>
            <div className="mt-0.5 text-[12.5px] text-dim">{t('admin.autoScanHint')}</div>
          </div>
          <Switch checked={autoScan} onChange={setAutoScan} label={t('admin.autoScan')} />
        </div>
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
      </Dialog>
    );
  },
);
