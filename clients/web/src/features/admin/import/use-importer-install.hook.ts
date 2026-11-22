import type { ModuleId } from '@kromatv/client/modules';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IMPORTERS_QUERY } from '#web/features/admin/import/use-importers.hook';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

/** What installing an importer would bring and what each module may do: the
 * plan the Store's install shows, read before anything is fetched. */
export function useImporterPlan(id: ModuleId, include: readonly string[]) {
  const { moduleApi } = useWebRuntime();
  return useQuery({
    queryKey: ['import', 'plan', id, include],
    queryFn: () => moduleApi.fetchInstallPlan(id, [...include]),
    placeholderData: keepPreviousData,
  });
}

/** The modules the server holds, against which a plan says what is new. */
export function useHeldModules() {
  const { moduleApi } = useWebRuntime();
  return useQuery({ queryKey: ['import', 'held-modules'], queryFn: moduleApi.fetchAdminModules });
}

/** Installs an importer from the registry, held to the plan the owner was
 * shown, then asks the list of importers again. */
export function useImporterInstall(id: ModuleId) {
  const { moduleApi } = useWebRuntime();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (include: readonly string[]) => moduleApi.installById(id, [...include]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: IMPORTERS_QUERY }),
  });
}
