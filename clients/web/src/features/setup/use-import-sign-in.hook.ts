import type { Importer, ImportSignIn } from '@kromatv/client/importers';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useImportSession } from '#web/features/setup/import-session.component';
import { useWebRuntime } from '#web/shared/lib/web-runtime';

const ASK_AGAIN_MS = 2000;
const FAILED: ImportSignIn = { status: 'refused', reason: 'other' };

/** The id to ask again with, while a sign-in waits on the owner. */
export function pendingOf(answer: ImportSignIn | null): string | null {
  return answer?.status === 'pending' ? answer.pending : null;
}

function useTake(onAnswer: (answer: ImportSignIn) => void) {
  const { update } = useImportSession();
  return (answer: ImportSignIn) => {
    onAnswer(answer);
    if (answer.status === 'ready') {
      const only = answer.servers.length === 1 ? answer.servers[0] : undefined;
      update({ signIn: answer.signIn, servers: answer.servers, server: only?.id ?? null });
    }
    return answer;
  };
}

/** A sign-in to another server through one importer. The form is sent once.
 * When the other server wants the owner on a page of its own, the answer is
 * `pending` and the importer is asked again until the owner is done there. */
export function useImportSignIn(importer: Importer) {
  const { client } = useWebRuntime();
  const [answer, setAnswer] = useState<ImportSignIn | null>(null);
  const [busy, setBusy] = useState(false);
  const take = useTake(setAnswer);
  const pending = pendingOf(answer);
  useQuery({
    queryKey: ['setup', 'import-pending', importer.id, pending],
    queryFn: async () => take(await client.importers.resume(importer.id, pending ?? '')),
    enabled: pending !== null,
    refetchInterval: ASK_AGAIN_MS,
    retry: false,
  });
  const connect = async (fields: Record<string, string>) => {
    setBusy(true);
    const next = await client.importers.connect(importer.id, fields).catch(() => FAILED);
    take(next);
    setBusy(false);
  };
  return { answer, busy, connect };
}
