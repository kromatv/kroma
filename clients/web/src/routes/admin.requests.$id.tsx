import { createFileRoute } from '@tanstack/react-router';
import { RequestDetailPage } from '#web/features/admin/request-detail';

export const Route = createFileRoute('/admin/requests/$id')({
  component: RequestDetailRoute,
});

function RequestDetailRoute() {
  const { id } = Route.useParams();
  return <RequestDetailPage id={id} />;
}
