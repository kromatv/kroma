// A server-side folder browser: `value` is the committed path and `onChange`
// fires on "use this folder"; browsing state is internal, seeded from `value`.
// `onCancel` adds a cancel button for callers that show the browser on demand.
import type { AdminFsList } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, color, Divider, Icon, IconButton, ListRow, Row, Text } from '@kroma/ui/kit';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { kromaClient } from '#web/shared/lib/api';

// A capped, scrolling list: `overflow-y` and `max-height` have no React Native
// spelling, so the list stays a real element.
const LIST_PANE: CSSProperties = { maxHeight: 208, overflowY: 'auto' };

const SELECTED_FILL = {
  backgroundColor: color('success/15'),
  borderColor: color('success/35'),
} as const;

const DASHED = {
  borderWidth: 1,
  borderColor: color('tint/20'),
  borderStyle: 'dashed',
} as const;

export function FolderPicker({
  value,
  onChange,
  onCancel,
}: Readonly<{ value: string; onChange: (path: string) => void; onCancel?: () => void }>) {
  const t = useT();
  const [path, setPath] = useState(value || '');
  const [list, setList] = useState<AdminFsList | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    kromaClient()
      .adminBrowseFolders(path)
      .then((res) => {
        if (active) setList(res);
      })
      .catch(() => {
        if (active) setList(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path]);

  const atRoot = path === '';
  const entries = list?.entries ?? [];
  const canSelect = !atRoot;
  const isSelected = !atRoot && value === path;

  let listBody: ReactNode;
  if (loading && entries.length === 0) {
    listBody = (
      <Text variant="meta" color="textDim" textAlign="center" px={12} py={24}>
        {t('common.loading')}
      </Text>
    );
  } else if (entries.length === 0) {
    listBody = (
      <Text variant="meta" color="textDim" textAlign="center" px={12} py={24}>
        {t('admin.noSubfolders')}
      </Text>
    );
  } else {
    listBody = (
      <ListRow.Group size="sm">
        {entries.map((e) => (
          <ListRow.Root key={e.path} size="sm" onPress={() => setPath(e.path)}>
            <ListRow.Leading>
              <Icon name="folder" size={16} stroke={1.8} color="accent" />
            </ListRow.Leading>
            <ListRow.Label>{e.name}</ListRow.Label>
          </ListRow.Root>
        ))}
      </ListRow.Group>
    );
  }

  return (
    <Box radius="xs" bg="bg" border="borderStrong" overflow="hidden">
      <Row gap={8} px={12} py={10}>
        <IconButton
          variant="ghost"
          control="sm"
          icon="corner-left-up"
          label={t('admin.parentFolder')}
          onPress={() => list?.parent != null && setPath(list.parent)}
          disabled={list?.parent == null}
        />
        <Icon name="folder" size={15} stroke={1.8} color="accent" />
        <Text variant="meta" color="textMuted" lines={1} flex={1} minW={0}>
          {atRoot ? t('admin.volumes') : path}
        </Text>
      </Row>
      <Divider color="tint/6" />

      <div style={LIST_PANE}>{listBody}</div>

      <Divider color="tint/6" />
      <Row between gap={8} px={12} py={10}>
        <Text variant="meta" color="textDim" lines={1} flex={1} minW={0}>
          {value || ''}
        </Text>
        {onCancel ? (
          <Button size="sm" variant="ghost" label={t('common.cancel')} onPress={onCancel} />
        ) : null}
        <Button
          size="sm"
          variant={isSelected ? 'glass' : 'primary'}
          icon="check"
          label={t('admin.selectFolder')}
          onPress={() => onChange(path)}
          disabled={!canSelect}
          style={isSelected ? SELECTED_FILL : null}
        />
      </Row>
    </Box>
  );
}

/** A folder input that keeps the browser closed until asked for: a dashed add
 * button while empty, the committed path once set (editable, and removable when
 * `onClear` is given), expanding into the [`FolderPicker`] on demand. */
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
  const t = useT();
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <FolderPicker
        value={value}
        onChange={(path) => {
          onChange(path);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    );
  }
  if (!value) {
    return (
      <Button
        variant="ghost"
        size="sm"
        icon="plus"
        label={placeholder}
        onPress={() => setOpen(true)}
        style={DASHED}
      />
    );
  }
  return (
    <Row gap={10} px={12} py={8} radius="xs" bg="bg" border="border">
      <Icon name="folder" size={16} stroke={1.8} color="accent" />
      <Text variant="meta" color="textMuted" lines={1} flex={1} minW={0}>
        {value}
      </Text>
      <IconButton
        variant="ghost"
        size={26}
        glyph={15}
        icon="pencil"
        label={t('admin.changeFolder')}
        onPress={() => setOpen(true)}
      />
      {onClear ? (
        <IconButton
          variant="ghost"
          size={26}
          glyph={15}
          icon="x"
          label={t('admin.removeFolder')}
          onPress={onClear}
        />
      ) : null}
    </Row>
  );
}
