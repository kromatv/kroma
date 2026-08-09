// Renders the module page mounted at a splat path under / (main shell) or
// /admin (admin shell). The registry resolves the path to an enabled module's
// route; a disabled or unknown module renders the not-found state, so turning a
// module off makes its pages vanish just like its nav.

import { type KromaHost, ModuleLoading, ModuleScope, ModuleUnavailable } from '@kroma/module-sdk';
import { Suspense, useMemo } from 'react';
import { useModuleHostValue, useModuleRoute, useModuleT } from '#web/modules/ModuleHostProvider';

export function ModuleRouteOutlet({ path }: Readonly<{ path: string }>) {
  const host = useModuleHostValue();
  const route = useModuleRoute(path);
  // Give the page a host whose i18n resolves the module's OWN catalog first
  // (falling back to the core catalogs). `moduleT` is stable per module + locale.
  const moduleT = useModuleT(route?.moduleId ?? '');
  const scopedHost = useMemo<KromaHost | null>(
    () =>
      host
        ? {
            ...host,
            i18n: {
              t: moduleT,
              get locale() {
                return host.i18n.locale;
              },
            },
          }
        : null,
    [host, moduleT],
  );

  // The registry is still resolving, so it is too early to say the module is
  // missing: hold the page's silhouette rather than accusing it of absence.
  if (!scopedHost) return <ModuleLoading />;
  if (!route) return <ModuleUnavailable />;
  const Panel = route.component;
  return (
    <Suspense fallback={<ModuleLoading />}>
      <ModuleScope id={route.moduleId}>
        <Panel host={scopedHost} />
      </ModuleScope>
    </Suspense>
  );
}
