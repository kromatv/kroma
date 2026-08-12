// The Updates tab of the Modules page: every installed module whose registry
// version is newer, with per-row update actions, an "update all" batch (one
// catalog fetch server-side), and live per-module progress off the
// `module.op.*` stream.

import { formatBytes, type StoreModule } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, EmptyState, Icon, ListRow, Row, Text } from '@kroma/ui/kit';
import type { OpModule } from '#web/features/admin/module-ops';
import { OpProgress } from '#web/features/admin/module-store';
import { Image } from '#web/shared/ui';

function UpdateRow({
  m,
  op,
  busy,
  onUpdate,
  onOpen,
}: Readonly<{
  m: StoreModule;
  op: OpModule | undefined;
  busy: boolean;
  onUpdate: () => void;
  onOpen: () => void;
}>) {
  const t = useT();
  return (
    <ListRow.Root size="md" onPress={onOpen}>
      <ListRow.Leading>
        <Box w={36} h={36} radius="sm" overflow="hidden" bg={m.icon ? undefined : 'tint/5'}>
          {m.icon ? <Image src={m.icon} fit="cover" fill /> : null}
        </Box>
      </ListRow.Leading>
      <ListRow.Label>{m.name}</ListRow.Label>
      <Row gap={6}>
        <Text variant="meta" color="textDim">
          v{m.installedVersion}
        </Text>
        <Icon name="arrow-right" size={12} stroke={2.2} color="textDim" />
        <Text variant="meta" color="accentText">
          v{m.version}
        </Text>
        {m.size ? (
          <Text variant="meta" color="textDim">
            · {formatBytes(m.size)}
          </Text>
        ) : null}
      </Row>
      <ListRow.Trailing>
        {op ? (
          <OpProgress op={op} />
        ) : (
          <Button
            variant="glass"
            size="sm"
            label={t('admin.modulesUpdate')}
            onPress={onUpdate}
            disabled={busy}
          />
        )}
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

export function UpdatesList({
  updates,
  active,
  busy,
  error,
  onUpdateAll,
  onUpdate,
  onOpen,
}: Readonly<{
  updates: StoreModule[];
  active: Map<string, OpModule & { op: string }>;
  busy: boolean;
  error: string | null;
  onUpdateAll: () => void;
  onUpdate: (id: string) => void;
  onOpen: (id: string) => void;
}>) {
  const t = useT();
  if (updates.length === 0) {
    return (
      <EmptyState.Root icon="circle-check">
        <EmptyState.Title>{t('admin.modulesUpToDate')}</EmptyState.Title>
        <EmptyState.Hint>{t('admin.modulesUpToDateHint')}</EmptyState.Hint>
      </EmptyState.Root>
    );
  }
  const totalSize = updates.reduce((sum, m) => sum + (m.size ?? 0), 0);
  return (
    <Box gap={12}>
      {error && (
        <Text variant="meta" color="danger">
          {error}
        </Text>
      )}
      <Row wrap between gap={12}>
        <Text variant="meta" color="textMuted">
          {t('admin.modulesUpdatesCount', { count: updates.length })}
          {totalSize > 0 && <Text color="textDim"> · {formatBytes(totalSize)}</Text>}
        </Text>
        <Button
          variant="primary"
          size="sm"
          label={t('admin.modulesUpdateAll')}
          onPress={onUpdateAll}
          loading={busy}
          disabled={busy}
        />
      </Row>
      <ListRow.Group size="md">
        {updates.map((m) => (
          <UpdateRow
            key={m.id}
            m={m}
            op={active.get(m.id)}
            busy={busy}
            onUpdate={() => onUpdate(m.id)}
            onOpen={() => onOpen(m.id)}
          />
        ))}
      </ListRow.Group>
    </Box>
  );
}
