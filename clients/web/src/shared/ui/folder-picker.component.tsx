// A server-side folder browser: `value` is the committed path and `onChange`
// fires on "use this folder"; browsing state is internal, seeded from `value`.
// `onCancel` adds a cancel button for callers that show the browser on demand.

import type { AdminFsList } from '@kromatv/client/admin';
import { useT } from '@kromatv/ui';
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
  useStyles,
} from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

interface PickerProps {
  value: string;
  onChange: (path: string) => void;
  onCancel?: () => void;
}

interface Browsed {
  path: string;
  list: AdminFsList | null;
  loading: boolean;
}

function useFolder(path: string): Browsed {
  const { library } = useWebRuntime().client;
  const [loaded, setLoaded] = useState<{ path: string; list: AdminFsList | null } | null>(null);
  useEffect(() => {
    let active = true;
    const keep = (list: AdminFsList | null) => {
      if (active) {
        setLoaded({ path, list });
      }
    };
    library
      .browse(path)
      .then(keep)
      .catch(() => keep(null));
    return () => {
      active = false;
    };
  }, [path, library]);
  return { path, list: loaded?.list ?? null, loading: loaded?.path !== path };
}

function Nothing({ loading }: Readonly<{ loading: boolean }>) {
  const t = useT();
  return (
    <EmptyState.Root size="sm" icon={loading ? undefined : 'folder-off'}>
      {loading ? <Spinner size={22} /> : null}
      <EmptyState.Title>{loading ? t('common.loading') : t('admin.noSubfolders')}</EmptyState.Title>
    </EmptyState.Root>
  );
}

function Entries({ at, onOpen }: Readonly<{ at: Browsed; onOpen: (path: string) => void }>) {
  const entries = at.list?.entries ?? [];
  if (entries.length === 0) {
    return <Nothing loading={at.loading} />;
  }
  return entries.map((entry) => (
    <ListRow.Root key={entry.path} onPress={() => onOpen(entry.path)}>
      <ListRow.Leading>
        <Icon name="folder" size={17} thickness={1.8} color="accent" />
      </ListRow.Leading>
      <ListRow.Label>{entry.name}</ListRow.Label>
    </ListRow.Root>
  ));
}

function Crumb({ at, onOpen }: Readonly<{ at: Browsed; onOpen: (path: string) => void }>) {
  const t = useT();
  const atRoot = at.path === '';
  const parent = at.list?.parent;
  const busy = at.loading && (at.list?.entries.length ?? 0) > 0;
  return (
    <Row gap={8} px={10} py={8}>
      <IconButton
        variant="ghost"
        diameter={32}
        glyph={17}
        icon="arrow-up"
        label={t('admin.parentFolder')}
        onPress={() => parent != null && onOpen(parent)}
        disabled={parent == null}
      />
      <Icon name={atRoot ? 'server' : 'folder-open'} size={16} thickness={1.8} color="accent" />
      <Text variant="meta" color="textMuted" lines={1} flex={1} minW={0}>
        {atRoot ? t('admin.volumes') : at.path}
      </Text>
      {busy ? <Spinner size={14} /> : null}
    </Row>
  );
}

function Choose({ path, value, onChange, onCancel }: Readonly<PickerProps & { path: string }>) {
  const t = useT();
  const atRoot = path === '';
  const committed = !atRoot && value === path;
  return (
    <Row gap={8} px={10} py={8} justify="flex-end">
      {onCancel ? (
        <Button size="sm" variant="ghost" label={t('common.cancel')} onPress={onCancel} />
      ) : null}
      <Button
        size="sm"
        variant={committed ? 'outline' : 'primary'}
        active={committed}
        icon="check"
        label={t('admin.selectFolder')}
        onPress={() => onChange(path)}
        disabled={atRoot}
      />
    </Row>
  );
}

/** The browser itself, as the caller's own band: a crumb, the folders under it
 * and the two actions, sharing one card. */
export function FolderPicker({ value, onChange, onCancel }: Readonly<PickerProps>) {
  const s = useStyles(sDefinition);
  const [path, setPath] = useState(value || '');
  const at = useFolder(path);
  return (
    <ListRow.Group divider={0}>
      <Crumb at={at} onOpen={setPath} />
      <ScrollView style={s.pane}>
        <Entries at={at} onOpen={setPath} />
      </ScrollView>
      <Choose path={path} value={value} onChange={onChange} onCancel={onCancel} />
    </ListRow.Group>
  );
}

const sDefinition = styles({ pane: { maxH: 232 } });
