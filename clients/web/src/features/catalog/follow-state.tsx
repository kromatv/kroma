import { hasPermission } from '@kromatv/client/accounts';
import type { RequestKind } from '@kromatv/client/requests';
import { useT } from '@kromatv/ui';
import { Button } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '#web/shared/lib/auth';
import { RouteLink } from '#web/shared/ui/route-link';

export function FollowState({
  kind,
  tmdbId,
}: Readonly<{ kind: RequestKind; tmdbId: number | null }>) {
  const t = useT();
  const { user, client } = useAuth();
  const canMonitor = !!user && hasPermission(user, 'library.manage');
  const { data: followed } = useQuery({
    queryKey: ['monitoring', kind, tmdbId, 'followed'],
    queryFn: () =>
      client.monitoring
        .get(kind, tmdbId ?? 0)
        .then(() => true)
        .catch(() => false),
    enabled: canMonitor && tmdbId !== null,
    staleTime: 30_000,
  });

  if (!canMonitor || tmdbId === null || followed === undefined) return null;
  return (
    <Button
      variant="glass"
      icon={followed ? 'check' : 'radar'}
      label={followed ? t('monitoring.action') : t('monitoring.follow')}
      asChild
    >
      <RouteLink to="/admin/monitoring/$kind/$tmdbId" params={{ kind, tmdbId: String(tmdbId) }} />
    </Button>
  );
}
