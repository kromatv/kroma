import { checkCompat } from '@kromatv/core';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ClientOutdatedScreen } from '#mobile/components/client-outdated-screen.component';
import { buildInfo } from '#mobile/lib/build-info';
import { useClient } from '#mobile/lib/session';

/** The signed-in app, or the one screen a build the server no longer serves
 * shows in its place. A server that has not answered yet lets everything through. */
export function CompatGate({ children }: Readonly<{ children: ReactNode }>) {
  const client = useClient();
  const { data: health } = useQuery({ ...client.query.media.health(), staleTime: 5 * 60_000 });
  if (!health || checkCompat(buildInfo, health) !== 'client-outdated') {
    return children;
  }
  return <ClientOutdatedScreen server={health.version} />;
}
