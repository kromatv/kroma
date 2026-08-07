// The Updates tab of the Modules page: every installed module whose registry
// version is newer, with per-row update actions, an "update all" batch (one
// catalog fetch server-side), and live per-module progress off the
// `module.op.*` stream.

import { Button, Card, formatBytes, Image } from '@kroma/admin-kit';
import type { StoreModule } from '@kroma/core';
import { useT } from '@kroma/ui';
import { EmptyState } from '@kroma/ui/kit';
import { IconArrowRight } from '@tabler/icons-react';
import type { OpModule } from '#web/features/admin/module-ops';
import { OpProgress } from '#web/features/admin/module-store';

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
    <div className="flex items-center gap-3.5 border-b border-white/4 px-5 py-3.5 last:border-b-0">
      <button type="button" onClick={onOpen} aria-label={m.name} className="shrink-0">
        {m.icon ? (
          <Image src={m.icon} fit="cover" className="h-9 w-9 rounded-lg" />
        ) : (
          <div className="h-9 w-9 rounded-lg bg-white/5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-full truncate text-left text-[14px] font-bold text-text transition-colors hover:text-accent"
        >
          {m.name}
        </button>
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-dim">
          <span>v{m.installedVersion}</span>
          <IconArrowRight size={12} stroke={2.2} />
          <span className="font-semibold text-accent">v{m.version}</span>
          {m.size ? <span>· {formatBytes(m.size)}</span> : null}
        </div>
      </div>
      {op ? (
        <OpProgress op={op} />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          label={t('admin.modulesUpdate')}
          onClick={onUpdate}
          disabled={busy}
        />
      )}
    </div>
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
      <EmptyState
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
          onClick={onUpdateAll}
          loading={busy}
          disabled={busy}
        />
      </div>
      <Card className="overflow-hidden">
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
      </Card>
    </div>
  );
}
