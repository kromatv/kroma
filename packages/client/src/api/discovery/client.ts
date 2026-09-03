import type { Query, RequestContext } from '../../core/http';
import { DiscoverDetail, DiscoverResponse, type DiscoverType, type TmdbKind } from './schemas';

/** What a discovery listing asks for. `all` is the absence of a type filter and
 * page one is the absence of a page, which is how the server reads them. */
export interface DiscoverPage {
  type?: DiscoverType;
  page?: number;
}

const NARROWED: Readonly<Record<DiscoverType, string | undefined>> = {
  movie: 'movie',
  tv: 'tv',
  all: undefined,
};

const beyondFirst = (page = 1) => (page > 1 ? page : undefined);

export function discoverQuery({ type = 'all', page }: DiscoverPage = {}): Query {
  return { type: NARROWED[type], page: beyondFirst(page) };
}

/** TMDB discovery for the request flow: search titles the library may not have,
 * trending for the empty state, and a title detail with its season list. */
export default function discoveryApi(ctx: RequestContext) {
  return {
    search: (query: string, opts?: DiscoverPage) =>
      ctx.get('/discover/search', DiscoverResponse, {
        query: { q: query, ...discoverQuery(opts) },
      }),

    trending: (opts?: DiscoverPage) =>
      ctx.get('/discover/trending', DiscoverResponse, {
        query: discoverQuery(opts),
        concurrency: 'share',
      }),

    /** One title's request-flow detail. `kind` follows the route vocabulary
     * (`movie` | `tv`); the response speaks the catalog's (`movie` | `show`). */
    detail: (kind: TmdbKind, tmdbId: number) =>
      ctx.get('/discover/:kind/:tmdbId', DiscoverDetail, { params: { kind, tmdbId } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    discovery: ReturnType<typeof discoveryApi>;
  }
}
