import { hasPermission } from '@kromatv/client/accounts';
import { useT } from '@kromatv/ui';
import { toast, useConfirm } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { type AdminModule, message, UninstallConflictError } from '#web/features/admin/module-api';
import { useRefreshModules } from '#web/modules/ModuleHostProvider';
import { useAuth } from '#web/shared/lib/auth';
import type { CommandActionDef } from '#web/shared/lib/command-menu';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** The installed modules, and what the command menu offers to do to each: what the
 *  module's own page offers, with the same confirmation before an uninstall, and the
 *  same second one when other modules still depend on it. */
export function useModuleActions(): {
  modules: readonly AdminModule[];
  actionsOf: (module: AdminModule) => CommandActionDef[];
} {
  const t = useT();
  const { user } = useAuth();
  const { moduleApi } = useWebRuntime();
  const refresh = useRefreshModules();
  const confirm = useConfirm();
  const { data: modules = [] } = useQuery({
    queryKey: ['admin', 'modules'],
    queryFn: moduleApi.fetchAdminModules,
    enabled: !!user && hasPermission(user, 'settings.manage'),
  });

  const act = (work: () => Promise<unknown>) => async () => {
    try {
      await work();
    } catch (error) {
      toast({ message: message(error), icon: 'alert-triangle' });
    }
  };

  const toggle = async ({ id, name, enabled }: AdminModule) => {
    const { warning } = await moduleApi.setModuleEnabled(id, !enabled);
    await refresh();
    const done = t(enabled ? 'commands.moduleDisabled' : 'commands.moduleEnabled', { name });
    toast({ message: done, detail: warning ?? undefined, tone: warning ? 'plain' : 'success' });
  };

  const restart = async ({ id, name }: AdminModule) => {
    await moduleApi.restartModule(id);
    await refresh();
    toast({ message: t('commands.moduleRestarted', { name }), tone: 'success' });
  };

  const removeAnyway = async ({ id, name }: AdminModule, dependents: readonly string[]) => {
    const sure = await confirm({
      title: t('admin.modulesUninstall'),
      message: t('admin.modulesUninstallDependentsMsg', { list: dependents.join(', '), name }),
      confirmLabel: t('admin.modulesUninstallForce'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (sure) await moduleApi.uninstallModule(id, true);
    return sure;
  };

  const uninstall = async (module: AdminModule) => {
    try {
      await moduleApi.uninstallModule(module.id);
    } catch (error) {
      if (!(error instanceof UninstallConflictError)) throw error;
      if (!(await removeAnyway(module, error.dependents))) return;
    }
    await refresh();
    toast({ message: t('commands.moduleUninstalled', { name: module.name }), tone: 'success' });
  };

  const actionsOf = (module: AdminModule): CommandActionDef[] => [
    {
      label: t(module.enabled ? 'commands.moduleDisable' : 'commands.moduleEnable'),
      icon: module.enabled ? 'player-pause' : 'player-play',
      cap: 'settings.manage',
      run: act(() => toggle(module)),
    },
    ...(module.enabled && module.hasSidecar
      ? [
          {
            label: t('admin.modulesRestart'),
            icon: 'refresh',
            cap: 'settings.manage',
            run: act(() => restart(module)),
          } as const,
        ]
      : []),
    ...(module.removable
      ? [
          {
            label: t('admin.modulesUninstall'),
            icon: 'trash',
            tone: 'danger',
            cap: 'settings.manage',
            confirm: {
              title: t('admin.modulesUninstall'),
              message: t('admin.modulesUninstallMsg', { name: module.name }),
            },
            run: act(() => uninstall(module)),
          } as const,
        ]
      : []),
  ];

  return { modules, actionsOf };
}
