// A server-side folder browser: `value` is the committed path and `onChange`
// fires on "use this folder"; browsing state is internal, seeded from `value`.
// `onCancel` adds a cancel button for callers that show the browser on demand.
import type { AdminFsList } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  ListRow,
  Row,
  Spinner,
  styles,
  Text,
} from '@kroma/ui/kit';
import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { kromaClient } from '#web/shared/lib/api';

/** The browser itself, as the caller's own band: a crumb, the folders under it
 * and the two actions, sharing one card. */
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
  const committed = !atRoot && value === path;

  let body: ReactNode;
  if (entries.length === 0) {
    body = (
      <EmptyState.Root size="sm" icon={loading ? undefined : 'folder-off'}>
        {loading ? <Spinner size={22} /> : null}
        <EmptyState.Title>
          {loading ? t('common.loading') : t('admin.noSubfolders')}
        </EmptyState.Title>
      </EmptyState.Root>
    );
  } else {
    body = entries.map((e) => (
      <ListRow.Root key={e.path} onPress={() => setPath(e.path)}>
        <ListRow.Leading>
          <Icon name="folder" size={17} thickness={1.8} color="accent" />
        </ListRow.Leading>
        <ListRow.Label>{e.name}</ListRow.Label>
      </ListRow.Root>
    ));
  }

  // The three bands are the group's own members, so the card, its corner, its
  // edge and the rules between the bands are drawn once rather than nested.
  return (
    <ListRow.Group divider={0}>
      <Row gap={8} px={10} py={8}>
        <IconButton
          variant="ghost"
          diameter={32}
          glyph={17}
          icon="arrow-up"
          label={t('admin.parentFolder')}
          onPress={() => list?.parent != null && setPath(list.parent)}
          disabled={list?.parent == null}
        />
        <Icon name={atRoot ? 'server' : 'folder-open'} size={16} thickness={1.8} color="accent" />
        <Text variant="meta" color="textMuted" lines={1} flex={1} minW={0}>
          {atRoot ? t('admin.volumes') : path}
        </Text>
        {loading && entries.length > 0 ? <Spinner size={14} /> : null}
      </Row>

      <ScrollView style={s.pane}>{body}</ScrollView>

      <Row gap={8} px={10} py={8} justify="flex-end">
        {onCancel ? (
          <Button size="sm" variant="ghost" label={t('common.cancel')} onPress={onCancel} />
        ) : null}
        <Button
          size="sm"
          // The kit's own "already on" paint rather than a fill invented here:
          // browsing back onto the folder already committed offers nothing.
          variant={committed ? 'outline' : 'primary'}
          active={committed}
          icon="check"
          label={t('admin.selectFolder')}
          onPress={() => onChange(path)}
          disabled={atRoot}
        />
      </Row>
    </ListRow.Group>
  );
}

const s = styles({ pane: { maxH: 232 } });
