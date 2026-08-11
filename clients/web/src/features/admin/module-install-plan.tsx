// The install dialog's plan stage: the resolved module list, the opt-in
// groups (optional deps + capability providers) and the unsatisfiable-
// requirement warnings. The dialog itself lives in module-install.tsx.

import {
  formatBytes,
  type StoreMissingCapability,
  type StoreOptionalModule,
  type StorePlan,
  type StorePlanModule,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import { Badge, Button, Callout, Dialog, ListRow, Spinner, Text } from '@kroma/ui/kit';

/** The dialog title already says the install failed, so the server's
 * `install failed:` prefix is dropped and the detail (which module, which
 * check refused it) is set small and monospaced instead of a wall of red. */
export function ErrorBox({ text }: Readonly<{ text: string }>) {
  const clean = text.replace(/^install failed:\s*/i, '').replace(/^update failed:\s*/i, '');
  return (
    <Callout.Root tone="danger">
      <Text variant="meta" font="mono" color="danger">
        {clean}
      </Text>
    </Callout.Root>
  );
}

function PlanRow({ m }: Readonly<{ m: StorePlanModule }>) {
  const t = useT();
  return (
    <ListRow.Root size="sm">
      <div className="flex items-center gap-2">
        <ListRow.Label>{m.name}</ListRow.Label>
        {m.requested ? null : <Badge tone="neutral">{t('admin.modulesInstallDependency')}</Badge>}
      </div>
      <ListRow.Hint>
        {m.installedVersion ? `v${m.installedVersion} → v${m.version}` : `v${m.version}`}
      </ListRow.Hint>
      {m.size ? (
        <ListRow.Trailing>
          <Text variant="meta" color="textMuted">
            {formatBytes(m.size)}
          </Text>
        </ListRow.Trailing>
      ) : null}
    </ListRow.Root>
  );
}

function OptionalRow({
  m,
  checked,
  onToggle,
}: Readonly<{ m: StoreOptionalModule; checked: boolean; onToggle: (v: boolean) => void }>) {
  const t = useT();
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-semibold text-text">
          {m.name} <span className="font-normal text-dim">v{m.version}</span>
        </div>
        {m.capability && m.for && (
          <p className="text-[11px] font-medium text-accent">
            {t('admin.modulesInstallProvidesFor', { kind: m.capability, name: m.for })}
          </p>
        )}
        {m.description && <p className="line-clamp-1 text-[11.5px] text-dim">{m.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {m.size ? (
          <span className="text-[12px] font-medium text-muted">{formatBytes(m.size)}</span>
        ) : null}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
      </div>
    </label>
  );
}

function OptInGroup({
  title,
  rows,
  include,
  onToggle,
}: Readonly<{
  title: string;
  rows: StoreOptionalModule[];
  include: string[];
  onToggle: (id: string, on: boolean) => void;
}>) {
  if (rows.length === 0) return null;
  return (
    <>
      <p className="mt-4 text-[12px] font-semibold uppercase tracking-[.12em] text-dim">{title}</p>
      <div className="mt-1 divide-y divide-white/5">
        {rows.map((m) => (
          <OptionalRow
            key={m.id}
            m={m}
            checked={include.includes(m.id)}
            onToggle={(v) => onToggle(m.id, v)}
          />
        ))}
      </div>
    </>
  );
}

function MissingWarnings({ missing }: Readonly<{ missing: StoreMissingCapability[] }>) {
  const t = useT();
  if (missing.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {missing.map((m) => (
        <Callout.Root
          key={`${m.kind}:${m.for}`}
          tone="accent"
          title={t('admin.modulesInstallMissing', {
            kind: m.id ? `${m.kind}:${m.id}` : m.kind,
            name: m.for,
          })}
        />
      ))}
    </div>
  );
}

export function PlanStage({
  plan,
  busy,
  error,
  optional,
  include,
  onToggle,
  onCancel,
  onRun,
}: Readonly<{
  plan: StorePlan | null;
  busy: boolean;
  error: string | null;
  optional: StoreOptionalModule[];
  include: string[];
  onToggle: (id: string, on: boolean) => void;
  onCancel: () => void;
  onRun: () => void;
}>) {
  const t = useT();
  if (error) {
    return (
      <>
        <ErrorBox text={error} />
        <Dialog.Actions>
          <Button variant="ghost" size="sm" label={t('common.close')} onPress={onCancel} />
        </Dialog.Actions>
      </>
    );
  }
  if (!plan) {
    return (
      <div className="flex items-center gap-3 py-2 text-[13px] text-muted">
        <Spinner size={18} />
        {t('admin.modulesPlanLoading')}
      </div>
    );
  }
  return (
    <>
      <p className="text-[12px] font-semibold uppercase tracking-[.12em] text-dim">
        {t('admin.modulesInstallPlanIntro')}
      </p>
      <div className="mt-1">
        <ListRow.Group size="sm">
          {plan.modules.map((m) => (
            <PlanRow key={m.id} m={m} />
          ))}
        </ListRow.Group>
      </div>
      <OptInGroup
        title={t('admin.modulesInstallProviders')}
        rows={optional.filter((m) => m.capability)}
        include={include}
        onToggle={onToggle}
      />
      <OptInGroup
        title={t('admin.modulesInstallOptional')}
        rows={optional.filter((m) => !m.capability)}
        include={include}
        onToggle={onToggle}
      />
      <MissingWarnings missing={plan.missing} />
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-dim">
          {plan.totalSize > 0
            ? t('admin.modulesInstallTotal', { size: formatBytes(plan.totalSize) })
            : ''}
        </span>
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="sm" label={t('common.cancel')} onPress={onCancel} />
          <Button
            variant="primary"
            size="sm"
            label={t('admin.modulesInstall')}
            onPress={onRun}
            disabled={busy}
          />
        </div>
      </div>
    </>
  );
}
