// The form controls a library's folders are edited through: one card of rows
// saying what is committed, and the [`FolderPicker`] opening under it rather
// than in place of it, so the list stays readable while a folder is chosen.
import { useT } from '@kroma/ui';
import { Box, IconButton, ListRow } from '@kroma/ui/kit';
import { useState } from 'react';
import { FolderPicker } from '#web/features/admin/folder-picker';

function FolderRow({
  path,
  browsing,
  onEdit,
  onRemove,
}: Readonly<{
  path: string;
  browsing: boolean;
  onEdit: () => void;
  onRemove?: () => void;
}>) {
  const t = useT();
  return (
    <ListRow.Root icon="folder" label={path} selected={browsing || undefined}>
      <ListRow.Label>{path}</ListRow.Label>
      <ListRow.Trailing>
        <IconButton
          variant="ghost"
          diameter={32}
          glyph={16}
          icon="pencil"
          label={t('admin.changeFolder')}
          onPress={onEdit}
        />
        {onRemove ? (
          <IconButton
            variant="ghost"
            diameter={32}
            glyph={16}
            icon="x"
            label={t('admin.removeFolder')}
            onPress={onRemove}
          />
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

/** A single folder: one row saying what is committed, or offering to choose. */
export function FolderField({
  value,
  onChange,
  placeholder,
  onClear,
}: Readonly<{
  value: string;
  onChange: (path: string) => void;
  placeholder: string;
  onClear?: () => void;
}>) {
  const [open, setOpen] = useState(false);
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
        <FolderPicker
          value={value}
          onChange={(path) => {
            onChange(path);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </Box>
  );
}

/** The folders a library scans, as one card ending in the row that adds
 * another. A committed list holds each path once, so a path is the row's
 * identity; the handlers still address it by position, which is what makes
 * editing a row a replacement rather than an append. */
export function FolderListEditor({
  folders,
  onChange,
}: Readonly<{ folders: string[]; onChange: (folders: string[]) => void }>) {
  const t = useT();
  const [at, setAt] = useState<number | null>(null);

  const commit = (path: string) => {
    if (at === null) return;
    const next = folders.slice();
    if (at < next.length) next[at] = path;
    else next.push(path);
    onChange(next.filter((p, i) => next.indexOf(p) === i));
    setAt(null);
  };

  return (
    <Box gap={10}>
      <ListRow.Group>
        {folders.map((path, index) => (
          <FolderRow
            key={path}
            path={path}
            browsing={at === index}
            onEdit={() => setAt(index)}
            onRemove={() => onChange(folders.filter((_, i) => i !== index))}
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
