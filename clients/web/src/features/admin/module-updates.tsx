// The Updates tab of the Modules page: every installed module whose registry
// version is newer, with per-row update actions, an "update all" batch (one
// catalog fetch server-side), and live per-module progress off the
// `module.op.*` stream.

import { formatBytes, type StoreModule } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Button, EmptyState, ListRow } from '@kroma/ui/kit';
import { IconArrowRight } from '@tabler/icons-react';
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
    <ListRow.Root size="md" label={m.name} onPress={onOpen}>
      <ListRow.Leading>
        {m.icon ? (
          <Image src={m.icon} fit="cover" className="h-9 w-9 rounded-lg" />
        ) : (
          <div className="h-9 w-9 rounded-lg bg-white/5" />
        )}
      </ListRow.Leading>
      <ListRow.Label>{m.name}</ListRow.Label>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-dim">
        <span>v{m.installedVersion}</span>
        <IconArrowRight size={12} stroke={2.2} />
        <span className="font-semibold text-accent">v{m.version}</span>
        {m.size ? <span>· {formatBytes(m.size)}</span> : null}
      </div>
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
      <EmptyState.Root
        icon="circle-check"
        title={t('admin.modulesUpToDate')}
        hint={t('admin.modulesUpToDateHint')}
      />
    );
  }
  const totalSize = updates.reduce((sum, m) => sum + (m.size ?? 0), 0);
  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-muted">
          {t('admin.modulesUpdatesCount', { count: updates.length })}
          {totalSize > 0 && <span className="text-dim"> · {formatBytes(totalSize)}</span>}
        </span>
        <Button
          variant="primary"
          size="sm"
          label={t('admin.modulesUpdateAll')}
          onPress={onUpdateAll}
          loading={busy}
          disabled={busy}
        />
      </div>
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
    </div>
  );
}
