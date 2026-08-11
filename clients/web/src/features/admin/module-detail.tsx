// Slide-in module detail drawer: identity, versions,
// dependency graph, add-ons, declared config and the install / update /
// enable / uninstall actions, for installed modules and catalog-only entries
// alike. Uninstall confirms inline in the footer, including the
// informed-force path when other modules still depend on it. Resolves `true`
// when anything changed, so the caller knows whether to refresh.

import { useT } from '@kroma/ui';
import { Button, Dialog, Drawer, IconButton, Switch } from '@kroma/ui/kit';
import { type ReactNode, useRef, useState } from 'react';
import { createCallable } from 'react-call';
import { message, UninstallConflictError, uninstallModule } from '#web/features/admin/module-api';
import { useModuleData, useModuleToggle } from '#web/features/admin/module-data';
import {
  Addons,
  DepsSection,
  DrawerSettings,
  FooterProgress,
  HeaderIcon,
  Meta,
} from '#web/features/admin/module-detail-sections';
import { InstallModal } from '#web/features/admin/module-install';
import { useStoreOps } from '#web/features/admin/module-ops';

/** The inline confirm strip the footer swaps to before an uninstall: the
 * plain ask first, then the informed-force variant listing dependents. */
function ConfirmStrip({
  text,
  danger,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: Readonly<{
  text: string;
  danger: boolean;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <p className={`text-[12.5px] leading-relaxed ${danger ? 'text-danger' : 'text-muted'}`}>
        {text}
      </p>
      <Dialog.Actions
        onCancel={onCancel}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirm}
        confirmLabel={confirmLabel}
        destructive
        busy={busy}
      />
    </div>
  );
}

export const ModuleDetailDrawer = createCallable<{ id: string }, boolean>(({ call, id }) => {
  const t = useT();
  const { modules, catalog, reload, refreshAll } = useModuleData();
  const { activeByModule } = useStoreOps();
  const changed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [dependents, setDependents] = useState<string[] | null>(null);

  const all = modules ?? [];
  const installed = all.find((m) => m.id === id);
  const entry = catalog?.modules.find((m) => m.id === id);
  const op = activeByModule.get(id);
  const update = !!entry && entry.updateAvailable && entry.compatible;

  const markChanged = () => {
    changed.current = true;
    void refreshAll();
  };
  const toggler = useModuleToggle(id, markChanged);
  const close = () => call.end(changed.current);

  const install = async () => {
    if (await InstallModal.call({ id })) markChanged();
  };

  const doUninstall = async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await uninstallModule(id, force);
      changed.current = true;
      await refreshAll();
      call.end(true);
    } catch (e) {
      if (e instanceof UninstallConflictError) {
        setDependents(e.dependents);
      } else {
        setError(message(e));
        setRemoving(false);
        setDependents(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const name = installed?.name ?? entry?.name ?? id;
  const version = installed?.version ?? entry?.version;
  const description = installed?.description ?? entry?.description ?? '';
  const metaRows: [string, ReactNode][] = [
    [
      t('admin.modulesVersion'),
      update ? (
        <>
          v{installed?.version} <span className="text-accent">→ v{entry?.version}</span>
        </>
      ) : (
        `v${version ?? '?'}`
      ),
    ],
  ];
  if (entry?.source) metaRows.push([t('admin.modulesSource'), entry.source]);
  const minServer = entry?.minServer ?? installed?.minServer;
  if (minServer) metaRows.push([t('admin.modulesMinServer'), minServer]);
  if (entry?.target) metaRows.push([t('admin.modulesPlatform'), entry.target]);

  const footer = (() => {
    if (op) return <FooterProgress op={op} />;
    if (dependents) {
      return (
        <ConfirmStrip
          text={t('admin.modulesUninstallDependentsMsg', { list: dependents.join(', '), name })}
          danger
          confirmLabel={t('admin.modulesUninstallForce')}
          busy={busy}
          onCancel={() => setDependents(null)}
          onConfirm={() => void doUninstall(true)}
        />
      );
    }
    if (removing) {
      return (
        <ConfirmStrip
          text={t('admin.modulesUninstallMsg', { name })}
          danger={false}
          confirmLabel={t('admin.modulesUninstall')}
          busy={busy}
          onCancel={() => setRemoving(false)}
          onConfirm={() => void doUninstall(false)}
        />
      );
    }
    return (
      <div className="flex items-center gap-3">
        {installed && (
          <div className="flex items-center gap-2">
            <Switch
              checked={installed.enabled}
              onChange={toggler.busy ? undefined : (v) => void toggler.toggle(v)}
              label={name}
            />
            <span className="text-[12px] font-semibold text-dim">
              {installed.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
            </span>
          </div>
        )}
        <div className="flex-1" />
        {installed?.removable && (
          <Button
            variant="ghost"
            size="sm"
            label={t('admin.modulesUninstall')}
            onPress={() => setRemoving(true)}
          />
        )}
        {update && (
          <Button
            variant="primary"
            size="sm"
            label={t('admin.modulesUpdate')}
            onPress={() => void install()}
          />
        )}
        {!installed && entry?.compatible && (
          <Button
            variant="primary"
            size="sm"
            label={t('admin.modulesInstall')}
            onPress={() => void install()}
          />
        )}
      </div>
    );
  })();

  return (
    <Drawer open={!call.ended} onClose={close} title={name} width={460}>
      <div className="border-b border-white/[0.07] px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
            {t('admin.modulesSheet')}
          </span>
          <IconButton variant="ghost" icon="x" label={t('common.close')} onPress={close} />
        </div>
        <div className="flex items-start gap-4">
          <HeaderIcon id={id} installed={!!installed} icon={entry?.icon} />
          <div className="min-w-0 pt-0.5">
            <h2 className="font-display text-[21px] font-bold leading-[1.12]">{name}</h2>
            <div className="mt-1 truncate font-mono text-[11.5px] text-white/45">{id}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry?.library && (
                <span className="rounded-full bg-white/6 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                  {t('admin.modulesLibraryChip')}
                </span>
              )}
              {installed && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${installed.enabled ? 'bg-success/14 text-success' : 'bg-white/6 text-dim'}`}
                >
                  {installed.enabled ? t('admin.modulesEnabled') : t('admin.modulesDisabled')}
                </span>
              )}
              {update && (
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">
                  {t('admin.modulesUpdateChip', { version: entry.version })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {(error ?? toggler.error) && (
          <p className="break-words text-xs font-semibold text-danger">{error ?? toggler.error}</p>
        )}
        {description && <p className="text-[13px] leading-relaxed text-muted">{description}</p>}
        {entry && !entry.compatible && entry.reason && (
          <p className="text-[12.5px] font-semibold text-danger">{entry.reason}</p>
        )}
        <Meta rows={metaRows} />
        <DepsSection installed={installed} entry={entry} all={all} />
        <Addons id={id} catalog={catalog} />
        {installed && <DrawerSettings module={installed} onSaved={reload} />}
      </div>

      <div className="border-t border-white/[0.07] px-6 py-4.5">{footer}</div>
    </Drawer>
  );
}, 400);
