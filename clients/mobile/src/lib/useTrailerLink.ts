import type { TmdbKind } from '@kromatv/client/discovery';
import { playableTrailer, TRAILER_LABEL } from '@kromatv/core';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { trailerHref, trailerListQuery } from '#mobile/lib/trailer';

interface TrailerLink {
  label: string;
  open(): void;
}

/** The way to a title's trailer, or null until the server says it can play
 * one: no TMDB id, no trailer, or no module to fetch it all read as null. The
 * label says how the trailer reaches the viewer. */
export function useTrailerLink(
  kind: TmdbKind,
  tmdbId: number | null | undefined,
  title: string,
): TrailerLink | null {
  const t = useT();
  const client = useClient();
  const router = useRouter();
  const { data } = useQuery({
    ...trailerListQuery(client, kind, tmdbId ?? 0),
    enabled: tmdbId != null,
  });
  const trailer = playableTrailer(data);
  if (!trailer || tmdbId == null) return null;
  return {
    label: t(TRAILER_LABEL[trailer.version]),
    open: () => router.push(trailerHref(kind, tmdbId, title) as never),
  };
}
