// The form controls a library's folders are edited through: one card of rows
// saying what is committed, and the [`FolderPicker`] opening under it rather
// than in place of it, so the list stays readable while a folder is chosen.
import { useT } from '@kromatv/ui';
import { Box, IconButton, ListRow } from '@kromatv/ui/kit';
import { useState } from 'react';
import { FolderPicker } from '#web/shared/ui/folder-picker.component';

interface FolderRowProps {
  path: string;
  browsing: boolean;
  onEdit: () => void;
  onRemove?: () => void;
}

function RowAction({
  icon,
  label,
  onPress,
}: Readonly<{ icon: 'pencil' | 'x'; label: string; onPress: () => void }>) {
  return (
    <IconButton
      variant="ghost"
      diameter={32}
      glyph={16}
      icon={icon}
      label={label}
      onPress={onPress}
    />
  );
}

function FolderRow({ path, browsing, onEdit, onRemove }: Readonly<FolderRowProps>) {
  const t = useT();
  return (
    <ListRow.Root icon="folder" label={path} selected={browsing || undefined}>
      <ListRow.Label>{path}</ListRow.Label>
      <ListRow.Trailing>
        <RowAction icon="pencil" label={t('admin.changeFolder')} onPress={onEdit} />
        {onRemove ? (
          <RowAction icon="x" label={t('admin.removeFolder')} onPress={onRemove} />
        ) : null}
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

function AddFolderRow({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) {
  return (
    <ListRow.Root icon="folder-plus" chevron={false} onPress={onPress}>
      <ListRow.Label>{label}</ListRow.Label>
    </ListRow.Root>
  );
}

interface FolderFieldProps {
  value: string;
  onChange: (path: string) => void;
  placeholder: string;
  onClear?: () => void;
}

/** A single folder: one row saying what is committed, or offering to choose. */
export function FolderField({ value, onChange, placeholder, onClear }: Readonly<FolderFieldProps>) {
  const [open, setOpen] = useState(false);
  const choose = (path: string) => {
    onChange(path);
    setOpen(false);
  };
  return (
    <Box gap={10}>
      <ListRow.Group>
        {value ? (
          <FolderRow path={value} browsing={open} onEdit={() => setOpen(true)} onRemove={onClear} />
        ) : (
          <AddFolderRow label={placeholder} onPress={() => setOpen(true)} />
        )}
      </ListRow.Group>
      {open ? (
        <FolderPicker value={value} onChange={choose} onCancel={() => setOpen(false)} />
      ) : null}
    </Box>
  );
}

interface FolderListProps {
  folders: string[];
  onChange: (folders: string[]) => void;
}

function withFolderAt(folders: readonly string[], at: number, path: string): string[] {
  const next = folders.slice();
  if (at < next.length) {
    next[at] = path;
  } else {
    next.push(path);
  }
  return next.filter((held, index) => next.indexOf(held) === index);
}

function useFolderEdit({ folders, onChange }: FolderListProps) {
  const [at, setAt] = useState<number | null>(null);
  const commit = (path: string) => {
    if (at !== null) {
      onChange(withFolderAt(folders, at, path));
      setAt(null);
    }
  };
  const remove = (index: number) => onChange(folders.filter((_, held) => held !== index));
  return { at, setAt, commit, remove };
}

/** The folders a library scans, as one card ending in the row that adds
 * another. A committed list holds each path once, so a path is the row's
 * identity; the handlers still address it by position, which is what makes
 * editing a row a replacement rather than an append. */
export function FolderListEditor({ folders, onChange }: Readonly<FolderListProps>) {
  const t = useT();
  const { at, setAt, commit, remove } = useFolderEdit({ folders, onChange });
  return (
    <Box gap={10}>
      <ListRow.Group>
        {folders.map((path, index) => (
          <FolderRow
            key={path}
            path={path}
            browsing={at === index}
            onEdit={() => setAt(index)}
            onRemove={() => remove(index)}
          />
        ))}
        <AddFolderRow label={t('admin.addFolder')} onPress={() => setAt(folders.length)} />
      </ListRow.Group>
      {at !== null ? (
        <FolderPicker value={folders[at] ?? ''} onChange={commit} onCancel={() => setAt(null)} />
      ) : null}
    </Box>
  );
}
