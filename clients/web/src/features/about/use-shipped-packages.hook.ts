import type { Licenses } from '@kromatv/client/licenses';
import {
  type LicenseSurface,
  type ShippedPackage,
  type SurfaceLicenses,
  shippedPackages,
} from '@kromatv/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { bundledLicenses } from '#web/features/about/bundled-licenses';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const build = (
  surface: LicenseSurface,
  licenses: Licenses | null | undefined,
): SurfaceLicenses[] => (licenses ? [{ surface, licenses }] : []);

/** Every third-party package the server and this web build ship, merged. */
export function useShippedPackages(): {
  packages: ShippedPackage[];
  pending: boolean;
  serverFailed: boolean;
} {
  const { client } = useWebRuntime();
  const server = useQuery({ ...client.query.licenses.list(), staleTime: Infinity });
  const web = useQuery({
    queryKey: ['web', 'bundled-licenses'],
    queryFn: bundledLicenses,
    staleTime: Infinity,
  });
  const packages = useMemo(
    () => shippedPackages([...build('server', server.data), ...build('web', web.data)]),
    [server.data, web.data],
  );
  return { packages, pending: server.isPending || web.isPending, serverFailed: server.isError };
}
