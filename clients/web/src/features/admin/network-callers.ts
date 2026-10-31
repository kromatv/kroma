import { useT } from '@kromatv/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useAuth } from '#web/shared/lib/auth';

export const CORE_CALLER = 'core';

/** Names a caller for a reader: the server by name, a module by the name its
 * manifest gives, and an id nothing on this server answers to as itself. */
export function useCallerName(): (caller: string) => string {
  const t = useT();
  const { client } = useAuth();
  const { data } = useQuery({
    queryKey: ['modules'],
    queryFn: () => client.modules.list(),
    staleTime: 30_000,
  });
  const names = useMemo(
    () => new Map<string, string>((data ?? []).map((module) => [module.id, module.name])),
    [data],
  );
  return useCallback(
    (caller: string) =>
      caller === CORE_CALLER ? t('network.callerCore') : (names.get(caller) ?? caller),
    [names, t],
  );
}
