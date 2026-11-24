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

/** A title's or a season's chosen pictures, and what changing one is doing.
 * `link` resolves to whether the picture at that address was kept. */
export interface Slots {
  chosen: ChosenArt | undefined;
  busy: ArtRole | null;
  error: string | null;
  upload: (role: ArtRole, picture: Blob) => void;
  link: (role: ArtRole, url: string) => Promise<boolean>;
  reset: (role: ArtRole) => void;
}

function useArtAction(queryKey: readonly unknown[]) {
  const t = useT();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<ArtRole | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const act = async (role: ArtRole, work: () => Promise<unknown>) => {
    setBusy(role);
    setFailure(null);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey });
      return true;
    } catch (e: unknown) {
      setFailure(apiErrorText(e, t('artwork.applyFailed')));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, failure, act };
}

/** The pictures an admin chose for a title or a season, with the upload, the
 * link and the reset of each slot. A failed change leaves its message in
 * `error`. */
export function useChosenArt(kind: ArtKind, raw: string): Slots {
  const t = useT();
  const { client } = useAuth();
  const art = client.media.chosenArt;
  const id = SUBJECTS[kind].parse(raw);
  const queryKey = ['chosen-art', kind, id] as const;
  const { data, error: loadError } = useQuery({ queryKey, queryFn: () => art.get(kind, id) });
  const { busy, failure, act } = useArtAction(queryKey);
  return {
    chosen: data,
    busy,
    error: failure ?? (loadError ? apiErrorText(loadError, t('artwork.loadFailed')) : null),
    upload: (role, picture) => void act(role, () => art.choose({ kind, id, role }, picture)),
    link: (role, url) => act(role, () => art.chooseLink({ kind, id, role }, url)),
    reset: (role) => void act(role, () => art.reset({ kind, id, role })),
  };
}
