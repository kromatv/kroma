import { TmdbKind } from '@kromatv/client/discovery';
import type { QueryClient } from '@kromatv/client/query';
import { routeParam } from '#mobile/lib/nav';

const LIST_FRESH_MS = 30 * 60_000;

interface TrailerRoute {
  kind: TmdbKind;
  tmdbId: number;
  title: string | null;
}

/** A title's trailer list as both its button and its player read it, so the
 * player opens on the answer the button was drawn from. */
export function trailerListQuery(client: QueryClient, kind: TmdbKind, tmdbId: number) {
  return { ...client.query.trailers.list(kind, tmdbId), staleTime: LIST_FRESH_MS, retry: false };
}

export function trailerHref(kind: TmdbKind, tmdbId: number, title: string): string {
  return `/trailer/${kind}/${tmdbId}?title=${encodeURIComponent(title)}`;
}

/** The trailer a player route names, or null when its path cannot name one. */
export function trailerRoute(params: {
  kind?: string | string[];
  tmdbId?: string | string[];
  title?: string | string[];
}): TrailerRoute | null {
  const kind = TmdbKind.safeParse(routeParam(params.kind));
  const tmdbId = Number(routeParam(params.tmdbId));
  if (!kind.success || !Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  return { kind: kind.data, tmdbId, title: routeParam(params.title) };
}
