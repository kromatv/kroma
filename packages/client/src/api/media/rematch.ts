import type { RequestContext } from '../../core/http';
import type { SubjectId } from './ids';
import { MatchCandidates, type RematchKind } from './schemas';

/** Correcting a wrong TMDB match on one catalog element. Both calls need
 * `library.manage`. */
export function rematchApi(ctx: RequestContext) {
  return {
    /** Ranked TMDB candidates for one element. `query` overrides the search text
     * when the operator types their own; scores still compare against the title
     * and year parsed from the filename, so the confidence stays honest. */
    candidates: (kind: RematchKind, id: SubjectId, query?: string) =>
      ctx.get('/rematch/:kind/:id/candidates', MatchCandidates, {
        params: { kind, id },
        query: { q: query?.trim() },
        concurrency: 'latest',
      }),

    /** Pin `tmdbId` to this element, or pass `null` to clear the pin and let the
     * server resolve it automatically again. Returns once the re-enrichment is
     * queued; the new art arrives via the usual item/show update event. */
    set: (kind: RematchKind, id: SubjectId, tmdbId: number | null) =>
      ctx.post('/rematch/:kind/:id', { params: { kind, id }, body: { tmdbId } }),
  };
}
