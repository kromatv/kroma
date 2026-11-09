import type { TmdbKind } from '@kromatv/client/discovery';
import { playableTrailer, TRAILER_LABEL } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Button } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useKromaClient } from '#web/shared/lib/web-runtime';
import { RouteLink } from '#web/shared/ui/route-link';

const LIST_FRESH_MS = 30 * 60_000;

/** The detail hero's trailer button: shown once the server says it can play
 *  the title's best trailer, labelled by how that trailer reaches the viewer. */
export function TrailerButton({
  kind,
  tmdbId,
  title,
}: Readonly<{ kind: TmdbKind; tmdbId: number; title: string }>) {
  const t = useT();
  const client = useKromaClient();
  const { data } = useQuery({
    ...client.query.trailers.list(kind, tmdbId),
    staleTime: LIST_FRESH_MS,
    retry: false,
  });
  const trailer = playableTrailer(data);
  if (!trailer) return null;
  return (
    <Button variant="outline" icon="movie" label={t(TRAILER_LABEL[trailer.version])} asChild>
      <RouteLink
        to="/trailer/$kind/$tmdbId"
        params={{ kind, tmdbId: String(tmdbId) }}
        search={{ title }}
      />
    </Button>
  );
}
