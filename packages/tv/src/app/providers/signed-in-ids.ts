import type { KromaClient } from '@kromatv/client';
import type { SubjectId } from '@kromatv/client/media';
import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react';
import { useAuth } from '#tv/app/providers/auth';
import { useConnection } from '#tv/app/providers/connection';

/** A server-backed set of title ids for the signed-in user, emptied on sign-out. */
export function useSignedInIds(load: (client: KromaClient) => Promise<readonly SubjectId[]>): {
  ids: ReadonlySet<SubjectId>;
  setIds: Dispatch<SetStateAction<ReadonlySet<SubjectId>>>;
  client: KromaClient | null;
  refresh: () => void;
} {
  const { user, ready } = useAuth();
  const { client } = useConnection();
  const [ids, setIds] = useState<ReadonlySet<SubjectId>>(() => new Set());

  const active = ready && !!user && !!client;
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setIds(new Set());
  }

  const refresh = useCallback(() => {
    if (!ready || !user || !client) return;
    load(client)
      .then((list) => setIds(new Set(list)))
      .catch(() => undefined);
  }, [client, user, ready, load]);

  useEffect(() => refresh(), [refresh]);

  return { ids, setIds, client, refresh };
}
