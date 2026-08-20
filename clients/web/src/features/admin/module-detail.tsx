import type { StoreModule } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, EmptyState, Skeleton, Surface } from '@kroma/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { AdminModule } from '#web/features/admin/module-api';
import { message, UninstallConflictError, uninstallModule } from '#web/features/admin/module-api';
import { useModuleData, useModuleToggle } from '#web/features/admin/module-data';
import { ModuleActions, UninstallConfirm } from '#web/features/admin/module-detail-actions';
import {
  Addons,
  DepsSection,
  Meta,
  ModuleSettings,
  OpProgress,
  RestartCallout,
} from '#web/features/admin/module-detail-sections';
import {
  IdentityCard,
  identityOf,
  metaRowsFor,
  Problems,
} from '#web/features/admin/module-identity';
import { InstallModal } from '#web/features/admin/module-install';
import { ModuleLogs } from '#web/features/admin/module-logs';
import { useModuleRestart, useStoreOps } from '#web/features/admin/module-ops';
import { Denied, PageHeader, useCap } from '#web/features/admin/shell';

export function ModuleDetailPage({ id }: Readonly<{ id: string }>) {
  if (!useCap('settings.manage')) return <Denied />;
  return <ModuleDetailInner id={id} />;
}

function ModuleDetailInner({ id }: Readonly<{ id: string }>) {
  const t = useT();
  const navigate = useNavigate();
  const { modules, catalog, reload, refreshAll } = useModuleData();
  const { activeByModule } = useStoreOps();
  const removal = useUninstall(id);

  const refresh = () => void refreshAll();
  const toggler = useModuleToggle(id, refresh);
  const restart = useModuleRestart(id, refresh);
  const back = () => void navigate({ to: '/admin/modules' });

  const { all, installed, entry, update, restartable } = moduleView(id, modules, catalog);
  const op = activeByModule.get(id);

  const install = async () => {
    if (await InstallModal.call({ id })) refresh();
  };

  if (!installed && !entry) {
    if (!modules || !catalog) return <DetailSkeleton />;
    return <Gone onBack={back} />;
  }

  const { name, version, description } = identityOf(id, installed, entry);
  const metaRows = metaRowsFor(t, installed, entry, update, version);

  return (
    <>
      <PageHeader.Root>
        <PageHeader.Back label={t('admin.modulesTitle')} onPress={back} />
        <PageHeader.Title>{name}</PageHeader.Title>
        <PageHeader.Subtitle>{id}</PageHeader.Subtitle>
        <PageHeader.Actions>
          {op ? null : (
            <ModuleActions
              installed={installed}
              entry={entry}
              name={name}
              update={update}
              toggler={toggler}
              onUninstall={removal.ask}
              onInstall={() => void install()}
            />
          )}
        </PageHeader.Actions>
      </PageHeader.Root>

      {op ? (
        <Box mb={16}>
          <OpProgress op={op} />
        </Box>
      ) : null}

      {removal.asking && !op ? (
        <Box mb={16}>
          <UninstallConfirm
            name={name}
            dependents={removal.dependents}
            busy={removal.busy}
            onCancel={removal.cancel}
            onConfirm={(force) => void removal.confirm(force, refreshAll, back)}
          />
        </Box>
      ) : null}

      <Box row={{ base: false, lg: true }} gap={16} align="flex-start">
        <Box w={{ base: '100%', lg: 320 }} shrink={0} gap={16}>
          <IdentityCard
            id={id}
            installed={installed}
            entry={entry}
            update={update}
            description={description}
          />
        </Box>

        <Box flex minW={0} w={{ base: '100%', lg: 'auto' }}>
          <Surface elevated radius="xl" pad="lg" gap={24}>
            <Problems failure={removal.error ?? toggler.error} entry={entry} />
            <Meta rows={metaRows} />
            {restartable ? <RestartCallout module={restartable} restart={restart} /> : null}
            <DepsSection installed={installed} entry={entry} all={all} />
            <Addons id={id} catalog={catalog} />
            <InstalledSections installed={installed} id={id} onSaved={reload} />
          </Surface>
        </Box>
      </Box>
    </>
  );
}

function moduleView(
  id: string,
  modules: AdminModule[] | null | undefined,
  catalog: { modules: StoreModule[] } | null | undefined,
) {
  const all = modules ?? [];
  const installed = all.find((m) => m.id === id);
  const entry = catalog?.modules.find((m) => m.id === id);
  return {
    all,
    installed,
    entry,
    update: !!entry && entry.updateAvailable && entry.compatible,
    restartable: installed?.enabled && installed.hasSidecar ? installed : null,
  };
}

function InstalledSections({
  installed,
  id,
  onSaved,
}: Readonly<{ installed: AdminModule | undefined; id: string; onSaved: () => void }>) {
  if (!installed) return null;
  return (
    <>
      <ModuleSettings module={installed} onSaved={onSaved} />
      <ModuleLogs id={id} />
    </>
  );
}

function useUninstall(id: string) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dependents, setDependents] = useState<string[] | null>(null);

  const cancel = () => {
    setAsking(false);
    setDependents(null);
  };

  const confirm = async (force: boolean, refreshAll: () => Promise<unknown>, done: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await uninstallModule(id, force);
      await refreshAll();
      done();
    } catch (e) {
      if (e instanceof UninstallConflictError) {
        setDependents(e.dependents);
      } else {
        setError(message(e));
        cancel();
      }
    } finally {
      setBusy(false);
    }
  };

  return { asking, busy, error, dependents, ask: () => setAsking(true), cancel, confirm };
}

function Gone({ onBack }: Readonly<{ onBack: () => void }>) {
  const t = useT();
  return (
    <>
      <PageHeader.Root>
        <PageHeader.Title>{t('admin.modulesTitle')}</PageHeader.Title>
      </PageHeader.Root>
      <EmptyState.Root icon="apps">
        <EmptyState.Title>{t('error.notFoundTitle')}</EmptyState.Title>
        <EmptyState.Actions>
          <Button
            variant="glass"
            size="sm"
            icon="chevron-left"
            label={t('common.back')}
            onPress={onBack}
          />
        </EmptyState.Actions>
      </EmptyState.Root>
    </>
  );
}

function DetailSkeleton() {
  return (
    <Box gap={16} aria-busy>
      <Skeleton w={280} h={28} radius="sm" />
      <Box row={{ base: false, lg: true }} gap={16} align="flex-start">
        <Box w={{ base: '100%', lg: 320 }} shrink={0}>
          <Skeleton w="100%" h={200} radius="xl" />
        </Box>
        <Box flex minW={0}>
          <Skeleton w="100%" h={320} radius="xl" />
        </Box>
      </Box>
    </Box>
  );
}
