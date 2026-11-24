import { apiErrorText } from '@kromatv/client';
import {
  type ArtKind,
  type ArtRole,
  type ChosenArt,
  ItemId,
  SeasonId,
  ShowId,
} from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useAuth } from '#web/shared/lib/auth';

const SUBJECTS = { item: ItemId, show: ShowId, season: SeasonId } as const;

/** A title's or a season's chosen pictures, and what changing one is doing. */
export interface Slots {
  chosen: ChosenArt | undefined;
  busy: ArtRole | null;
  error: string | null;
  upload: (role: ArtRole, picture: Blob) => void;
  reset: (role: ArtRole) => void;
}

/** The pictures an admin chose for a title or a season, with the upload and
 * the reset of each slot. A failed change leaves its message in `error`. */
export function useChosenArt(kind: ArtKind, raw: string): Slots {
  const t = useT();
  const { client } = useAuth();
  const queryClient = useQueryClient();
  const id = SUBJECTS[kind].parse(raw);
  const queryKey = ['chosen-art', kind, id] as const;
  const { data, error: loadError } = useQuery({
    queryKey,
    queryFn: () => client.media.chosenArt.get(kind, id),
  });
  const [busy, setBusy] = useState<ArtRole | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const act = (role: ArtRole, work: () => Promise<unknown>) => {
    setBusy(role);
    setFailure(null);
    work()
      .then(() => queryClient.invalidateQueries({ queryKey }))
      .catch((e: unknown) => setFailure(apiErrorText(e, t('artwork.applyFailed'))))
      .finally(() => setBusy(null));
  };
  return {
    chosen: data,
    busy,
    error: failure ?? (loadError ? apiErrorText(loadError, t('artwork.loadFailed')) : null),
    upload: (role, picture) =>
      act(role, () => client.media.chosenArt.choose({ kind, id, role }, picture)),
    reset: (role) => act(role, () => client.media.chosenArt.reset({ kind, id, role })),
  };
}
