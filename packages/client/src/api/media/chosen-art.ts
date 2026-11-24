import type { RequestContext } from '../../core/http';
import type { SeasonId, SubjectId } from './ids';
import { ArtShown, ChosenArt, type ArtKind, type ArtRole } from './schemas';

/** One picture of a title: the film, episode (`item`), show or season `id`, and
 * its `role`. */
export interface ArtSlot {
  kind: ArtKind;
  id: SubjectId | SeasonId;
  role: ArtRole;
}

/** The pictures an admin chooses for a film, an episode, a show or a season,
 * which come before the pictures beside its files and fetched art. Every call
 * needs `library.manage`; the new art arrives via the usual item/show update
 * event, a season's via its show's. */
export function chosenArtApi(ctx: RequestContext) {
  return {
    /** What an admin chose for a title, each picture null when none was. */
    get: (kind: ArtKind, id: SubjectId | SeasonId) =>
      ctx.get('/art/:kind/:id', ChosenArt, { params: { kind, id } }),

    /** Show `file` in `slot`, in place of any picture chosen before. */
    choose: ({ kind, id, role }: ArtSlot, file: Blob) =>
      ctx.upload('/art/:kind/:id/:role', file, ArtShown, { params: { kind, id, role } }),

    /** Show the picture at `url`, an `http` or `https` address on the public
     * internet, in `slot`. The server fetches it once and keeps it as an upload. */
    chooseLink: ({ kind, id, role }: ArtSlot, url: string) =>
      ctx.post('/art/:kind/:id/:role/link', ArtShown, {
        params: { kind, id, role },
        body: { url },
      }),

    /** Hand `slot` back to the picture beside the title's files, or to fetched art. */
    reset: ({ kind, id, role }: ArtSlot) =>
      ctx.delete('/art/:kind/:id/:role', { params: { kind, id, role } }),
  };
}
