// The Discover tab of the Modules page: every module the configured registries
// offer, enriched with this server's verdict. A card opens the detail drawer;
// its action installs (through the plan dialog), updates, or shows the
// installed state, and a live `module.op.*` stream replaces the action with a
// download/install progress bar.

import { Button, Card, CardSkeleton, formatBytes, Image, ProgressBar } from '@kroma/admin-kit';
import type { StoreCatalog, StoreModule } from '@kroma/core';
import { useT } from '@kroma/ui';
import { EmptyState } from '@kroma/ui/kit';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { matchesQuery } from '#web/features/admin/module-api';
import { type OpModule, opPct, PHASE_KEY, runningPct } from '#web/features/admin/module-ops';

/** Compact live progress: the phase label above a thin bar. */
export function OpProgress({ op }: Readonly<{ op: OpModule }>) {
  const t = useT();
  const pct = opPct(op);
  const label = t(PHASE_KEY[op.phase]);
  return (
    <div className="w-28 shrink-0">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-dim">
        <span>{label}</span>
        {pct !== null && op.phase === 'download' && <span>{pct}%</span>}
      </div>
      <ProgressBar pct={runningPct(op.phase, pct)} height={4} />
    </div>
  );
}

function CardAction({
  m,
  op,
  onInstall,
  onUpdate,
}: Readonly<{
  m: StoreModule;
  op: OpModule | undefined;
  onInstall: () => void;
  onUpdate: () => void;
}>) {
  const t = useT();
  if (op) return <OpProgress op={op} />;
  if (!m.compatible) {
    return (
      <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-dim">
        {t('admin.modulesIncompatible')}
      </span>
    );
  }
  if (m.installedVersion && m.updateAvailable) {
    return (
      <Button variant="primary" size="sm" label={t('admin.modulesUpdate')} onClick={onUpdate} />
    );
  }
  if (m.installedVersion) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-success">
        <IconCircleCheckFilled size={15} />
        {t('admin.modulesInstalled')}
      </span>
    );
  }
  return (
    <Button variant="secondary" size="sm" label={t('admin.modulesInstall')} onClick={onInstall} />
  );
}

function StoreCard({
  m,
  op,
  onOpen,
  onInstall,
  onUpdate,
}: Readonly<{
  m: StoreModule;
  op: OpModule | undefined;
  onOpen: () => void;
  onInstall: () => void;
  onUpdate: () => void;
}>) {
  const t = useT();
  return (
    <Card className={`flex items-start gap-3 p-4 ${m.compatible ? '' : 'opacity-70'}`}>
      <button type="button" onClick={onOpen} aria-label={m.name} className="shrink-0">
        {m.icon ? (
          <Image src={m.icon} fit="cover" className="mt-0.5 h-10 w-10 rounded-xl" />
        ) : (
          <div className="mt-0.5 h-10 w-10 rounded-xl bg-white/5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="truncate text-left font-semibold text-text transition-colors hover:text-accent"
          >
            {m.name}
          </button>
          <CardAction m={m} op={op} onInstall={onInstall} onUpdate={onUpdate} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-dim">
          <span>v{m.version}</span>
          {m.size ? <span>· {formatBytes(m.size)}</span> : null}
          <span>·</span>
          <span className={m.source === 'Official' ? 'font-semibold text-accent' : ''}>
            {m.source === 'Official' ? t('admin.modulesOfficial') : m.source}
          </span>
          {m.library && <span>· {t('admin.modulesLibraryChip')}</span>}
          {m.installedVersion && m.updateAvailable && (
            <span className="font-semibold text-accent">
              · {t('admin.modulesUpdateChip', { version: m.version })}
            </span>
          )}
        </div>
        {m.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{m.description}</p>}
        {!m.compatible && m.reason && (
          <p className="mt-1 text-[11px] font-semibold text-danger">{m.reason}</p>
        )}
      </div>
    </Card>
  );
}

/** The merged catalog grid; loading, blackout and no-match states included so
 * the registry state is never a mystery. Per-registry status lives in the
 * Registries drawer. */
export function StoreGrid({
  catalog,
  query,
  active,
  onOpen,
  onInstall,
  onUpdate,
}: Readonly<{
  catalog: StoreCatalog | null | undefined;
  query: string;
  active: Map<string, OpModule & { op: string }>;
  onOpen: (id: string) => void;
  onInstall: (id: string) => void;
  onUpdate: (id: string) => void;
}>) {
  const t = useT();
  if (!catalog) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }
  // Only a total blackout is an error here: with several registries configured,
  // one unreachable host still leaves a usable catalog, and its failure is
  // reported on its row in the Registries drawer.
  if (catalog.modules.length === 0 && catalog.error) {
    return (
      <Card className="flex flex-col gap-2 p-5">
        <p className="text-sm font-semibold text-danger">{t('admin.modulesCatalogError')}</p>
        <p className="break-all text-xs text-muted">{catalog.error}</p>
        <p className="text-xs text-muted">{t('admin.modulesCatalogErrorHint')}</p>
      </Card>
    );
  }
  const shown = catalog.modules
    .filter((m) => matchesQuery(m, query))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (shown.length === 0) {
    return (
      <EmptyState icon="search" title={t('admin.modulesEmptySearch', { query: query.trim() })} />
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {shown.map((m) => (
        <StoreCard
          key={m.id}
          m={m}
          op={active.get(m.id)}
          onOpen={() => onOpen(m.id)}
          onInstall={() => onInstall(m.id)}
          onUpdate={() => onUpdate(m.id)}
        />
      ))}
    </div>
  );
}
