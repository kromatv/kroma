import { workerContext } from '@kroma/site-kit/worker-env';
import { createServerFn } from '@tanstack/react-start';
import type { VersionRow } from '#site/lib/history';

/** Which version of the asked-for id every recent release shipped, or nothing at
 *  all when it is not a module id. */
export async function moduleVersions({ data }: { data: { id: string } }): Promise<VersionRow[]> {
  // Imported here, not at module scope: the route reaches this file from the
  // browser too, and zod plus the GitHub reader belong to the server alone.
  const { z } = await import('zod');
  const { moduleHistory } = await import('#site/lib/history');
  const parsed = z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,63}$/i)
    .safeParse(data.id);
  if (!parsed.success) return [];
  const { env, waitUntil } = await workerContext();
  return moduleHistory(env, waitUntil, parsed.data);
}

/** What crosses the wire: the id, and nothing else a caller may have hung off
 *  the payload. */
export const moduleIdInput = ({ id }: { id: string }) => ({ id });

export const getModuleHistory = createServerFn().validator(moduleIdInput).handler(moduleVersions);
