import { createFileRoute } from '@tanstack/react-router';
import { ModuleDetailPage } from '#web/features/admin/module-detail';

export const Route = createFileRoute('/admin/modules/$id')({
  component: ModuleDetailRoute,
});

function ModuleDetailRoute() {
  const { id } = Route.useParams();
  return <ModuleDetailPage id={id} />;
}
