import { hasPermission } from '@kromatv/client/accounts';
import { type ModuleNav, moduleIconUrl } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { toast } from '@kromatv/ui/kit';
import { useQueryClient } from '@tanstack/react-query';
import { adminNavSections } from '#web/features/admin/admin-nav';
import { isAnyAdmin } from '#web/features/admin/hooks';
import type { AdminModule } from '#web/features/admin/module-api';
import { useModuleActions } from '#web/features/admin/use-module-actions';
import { useModuleNavAll } from '#web/modules/ModuleHostProvider';
import { modulePageCommand } from '#web/modules/module-page-command';
import { apiBase } from '#web/shared/lib/api';
import { useAuth } from '#web/shared/lib/auth';
import { type CommandDef, useCommandQuery, useCommands } from '#web/shared/lib/command-menu';

function moduleStatus({ enabled, hasSidecar, running, unmet }: AdminModule) {
  if (!enabled) return { key: 'admin.modulesDisabled', tone: 'neutral' } as const;
  if (hasSidecar && !running) return { key: 'admin.modulesNotRunning', tone: 'danger' } as const;
  if (unmet?.length) return { key: 'admin.modulesUnmet', tone: 'warning' } as const;
  return { key: 'admin.modulesEnabled', tone: 'success' } as const;
}

function moduleFace(module: AdminModule, label: string, t: ReturnType<typeof useT>) {
  const { key, tone } = moduleStatus(module);
  const kind = label === module.name ? t('commands.moduleKind') : module.name;
  return {
    subtitle: `${kind} · v${module.version}`,
    image: moduleIconUrl(module.id, apiBase()),
    imageShape: 'tile',
    keywords: `${module.id} ${module.description ?? ''} ${t(key)}`,
    status: { label: t(key), tone },
  } as const;
}

/** The console in the command menu: exactly what its sidebar offers this viewer, so a
 *  page added there needs nothing here, and what can be done from anywhere. `/admin`
 *  turns away anyone who is no admin, so a page's own capability is not enough. A
 *  module's page carries what can be done to the module, and once something is typed it
 *  is drawn as a result, with the module's icon, version and status. A module with no such
 *  page is then findable the same way, turned off or not, and it opens on its settings. */
export function useAdminCommands(): void {
  const t = useT();
  const { user, client } = useAuth();
  const queryClient = useQueryClient();
  const moduleNav = useModuleNavAll();
  const typing = useCommandQuery().trim().length > 0;
  const { modules, actionsOf } = useModuleActions();

  const { sections, orphans } = adminNavSections(
    moduleNav,
    (cap) => !cap || (!!user && hasPermission(user, cap)),
  );

  const pageRow = (page: ModuleNav, group: string): CommandDef => {
    const { moduleId, label } = page;
    const module = modules.find((candidate) => candidate.id === moduleId);
    const row = { ...modulePageCommand(page), group };
    if (!module) return { ...row, actions: [] };
    return {
      ...row,
      ...(typing ? moduleFace(module, label, t) : {}),
      actions: [
        {
          label: t('commands.moduleSettings'),
          icon: 'settings',
          cap: 'settings.manage',
          to: '/admin/modules/$id',
          params: { id: moduleId },
        },
        ...actionsOf(module),
      ],
    };
  };

  const withPage = new Set(moduleNav.map((page) => page.moduleId));
  const pagelessModules = modules.filter((module) => !withPage.has(module.id));

  const checkForUpdates = async () => {
    const { available } = await client.admin.checkUpdates();
    void queryClient.invalidateQueries({ queryKey: ['admin', 'updates'] });
    toast({
      message: t(available ? 'admin.updatesReady' : 'admin.updatesCurrent'),
      tone: 'success',
    });
  };

  const scanLibraries = async () => {
    const { libraries } = await client.library.list();
    await Promise.all(libraries.map(({ id }) => client.library.scan(id)));
    void queryClient.invalidateQueries({ queryKey: ['admin', 'libraries'] });
  };

  useCommands(
    isAnyAdmin(user)
      ? [
          ...sections.flatMap(({ labelKey, items, modules: pages }) => {
            const group = t(labelKey);
            return [
              ...items.map(({ labelKey: label, icon, keywords, to }): CommandDef => ({
                label: t(label),
                group,
                icon,
                keywords,
                to,
              })),
              ...pages.map((page) => pageRow(page, group)),
            ];
          }),
          ...orphans.map((page) => pageRow(page, t('admin.groupModulePages'))),
          ...(typing ? pagelessModules : []).map((module): CommandDef => ({
            id: `module:${module.id}`,
            label: module.name,
            group: t('admin.navModules'),
            icon: 'puzzle',
            ...moduleFace(module, module.name, t),
            primaryLabel: t('commands.moduleSettings'),
            cap: 'settings.manage',
            to: '/admin/modules/$id',
            params: { id: module.id },
            actions: actionsOf(module),
          })),
          {
            label: t('commands.scanLibraries'),
            group: t('admin.groupMedia'),
            icon: 'refresh',
            keywords: 'scan rescan analyser bibliotheque library',
            cap: 'library.manage',
            done: t('commands.scanStarted'),
            run: scanLibraries,
          },
          {
            label: t('admin.updatesCheck'),
            group: t('admin.groupMaintenance'),
            icon: 'refresh',
            keywords: 'update upgrade version',
            cap: 'settings.manage',
            run: checkForUpdates,
          },
        ]
      : [],
  );
}
