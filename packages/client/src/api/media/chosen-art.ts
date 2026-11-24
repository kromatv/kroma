import type { RequestContext } from '../../core/http';
import type { SubjectId } from './ids';
import { ArtShown, ChosenArt, type ArtKind, type ArtRole } from './schemas';

/** One picture of a title: the film (`item`) or show `id`, and its `role`. */
export interface ArtSlot {
  kind: ArtKind;
  id: SubjectId;
  role: ArtRole;
}

/** The poster and the backdrop an admin chooses for a film or a show, which
 * come before the pictures beside its files and fetched art. Every call needs
 * `library.manage`; the new art arrives via the usual item/show update event. */
export function chosenArtApi(ctx: RequestContext) {
  return {
    /** What an admin chose for a title, each picture null when none was. */
    get: (kind: ArtKind, id: SubjectId) =>
      ctx.get('/art/:kind/:id', ChosenArt, { params: { kind, id } }),

    /** Show `file` in `slot`, in place of any picture chosen before. */
    choose: ({ kind, id, role }: ArtSlot, file: Blob) =>
      ctx.upload('/art/:kind/:id/:role', file, ArtShown, { params: { kind, id, role } }),

    /** Hand `slot` back to the picture beside the title's files, or to fetched art. */
    reset: ({ kind, id, role }: ArtSlot) =>
      ctx.delete('/art/:kind/:id/:role', { params: { kind, id, role } }),
  };
}
