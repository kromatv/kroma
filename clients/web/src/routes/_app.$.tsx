// Mount point for user-facing module pages: /<path> resolves to the enabled
// module route registered under that path, rendered in the main app shell.
// This catch-all sits below every concrete app route, so only an unmatched
// path reaches it.

import { createFileRoute } from '@tanstack/react-router';
import { ModuleRouteOutlet } from '#web/modules/ModuleRouteOutlet';

export const Route = createFileRoute('/_app/$')({
  component: ModulePage,
});

function ModulePage() {
  const { _splat } = Route.useParams();
  return <ModuleRouteOutlet path={_splat ?? ''} />;
}
