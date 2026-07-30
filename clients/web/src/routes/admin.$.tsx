// Mount point for admin module pages: /admin/<path> resolves to the enabled
// module route registered under that path, rendered inside the admin shell
// (AdminLayout + the admin permission gate from admin.tsx). This catch-all
// sits below every concrete /admin/* route, so only an unmatched path reaches
// it.

import { createFileRoute } from '@tanstack/react-router';
import { ModuleRouteOutlet } from '#web/modules/ModuleRouteOutlet';

export const Route = createFileRoute('/admin/$')({
  component: AdminModulePage,
});

function AdminModulePage() {
  const { _splat } = Route.useParams();
  return <ModuleRouteOutlet path={_splat ?? ''} />;
}
