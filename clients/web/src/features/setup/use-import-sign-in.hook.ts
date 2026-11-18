import type { Importer, ImportSignIn } from '@kromatv/client/importers';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useImportSession } from '#web/features/setup/import-session.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const ASK_AGAIN_MS = 2000;
const FAILED: ImportSignIn = { status: 'refused', reason: 'other' };

/** The id to ask again with, while a sign-in waits on the owner. */
export function pendingOf(answer: ImportSignIn | null | undefined): string | null {
  return answer?.status === 'pending' ? answer.pending : null;
}

/** Opens a page of the other server in a new tab. */
export function openPage(url: string): void {
  window.open(url, '_blank', 'noopener');
}

function useKeep() {
  const { update } = useImportSession();
  return (answer: ImportSignIn) => {
    if (answer.status === 'ready') {
      const only = answer.servers.length === 1 ? answer.servers[0] : undefined;
      update({ signIn: answer.signIn, servers: answer.servers, server: only?.id ?? null });
    }
    return answer;
  };
}

function useResumed(importer: Importer, pending: string | null) {
  const { client } = useWebRuntime();
  const keep = useKeep();
  return useQuery({
    queryKey: ['setup', 'import-pending', importer.id, pending],
    queryFn: async () => keep(await client.importers.resume(importer.id, pending ?? '')),
    enabled: pending !== null,
    refetchInterval: (query) => (pendingOf(query.state.data) === null ? false : ASK_AGAIN_MS),
    retry: false,
  });
}

/** A sign-in to another server with the form its importer declares. When the
 * other server also wants the owner on a page of its own, the answer is
 * `pending`, and the importer is asked again until the owner is done there. */
export function useImportSignIn(importer: Importer) {
  const { client } = useWebRuntime();
  const keep = useKeep();
  const [sent, setSent] = useState<ImportSignIn | null>(null);
  const [busy, setBusy] = useState(false);
  const resumed = useResumed(importer, pendingOf(sent));
  const connect = async (fields: Record<string, string>) => {
    setBusy(true);
    setSent(keep(await client.importers.connect(importer.id, fields).catch(() => FAILED)));
    setBusy(false);
  };
  return { answer: resumed.data ?? sent, busy, connect };
}

/** A sign-in to a server that has no form: it wants the owner on a page of its
 * own. The page is asked for as soon as the screen shows, so that one press
 * opens it, and the importer is asked again until the owner is done there. */
export function useImportPageSignIn(importer: Importer) {
  const { client } = useWebRuntime();
  const keep = useKeep();
  const begun = useQuery({
    queryKey: ['setup', 'import-page', importer.id],
    queryFn: async () => keep(await client.importers.connect(importer.id, {}).catch(() => FAILED)),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const resumed = useResumed(importer, pendingOf(begun.data));
  const again = () => {
    void begun.refetch();
  };
  return { answer: resumed.data ?? begun.data ?? null, asking: begun.isFetching, again };
}
