// Renders the module page mounted at a splat path under / (main shell) or
// /admin (admin shell). The registry resolves the path to an enabled module's
// route; a module that is turned off renders the unavailable state, so its
// pages vanish just like its nav. A path no module claims renders the
// `notFound` the route hands down.

import { type KromaHost, ModuleLoading, ModuleScope, ModuleUnavailable } from '@kromatv/module-sdk';
import { type ReactNode, Suspense, useMemo } from 'react';
import {
  useModuleHostValue,
  useModuleRouteMatch,
  useModuleT,
} from '#web/modules/ModuleHostProvider';

interface ModuleRouteOutletProps {
  path: string;
  notFound: ReactNode;
}

export function ModuleRouteOutlet({ path, notFound }: Readonly<ModuleRouteOutletProps>) {
  const host = useModuleHostValue();
  const match = useModuleRouteMatch(path);
  // Give the page a host whose i18n resolves the module's OWN catalog first
  // (falling back to the core catalogs). `moduleT` is stable per module + locale.
  const moduleT = useModuleT(match.kind === 'page' ? match.route.moduleId : '');
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
  if (match.kind === 'disabled') return <ModuleUnavailable />;
  if (match.kind === 'unknown') return notFound;
  const Panel = match.route.component;
  return (
    <Suspense fallback={<ModuleLoading />}>
      <ModuleScope id={match.route.moduleId}>
        <Panel host={scopedHost} />
      </ModuleScope>
    </Suspense>
  );
}
