import { RequestKind } from '@kromatv/client/requests';
import { createFileRoute } from '@tanstack/react-router';
import { MonitoringDetailPage } from '#web/features/admin/monitoring-detail';

export const Route = createFileRoute('/admin/monitoring/$kind/$tmdbId')({
  component: MonitoringDetailRoute,
});

function MonitoringDetailRoute() {
  const { kind, tmdbId } = Route.useParams();
  return <MonitoringDetailPage kind={RequestKind.parse(kind)} tmdbId={Number(tmdbId)} />;
}
