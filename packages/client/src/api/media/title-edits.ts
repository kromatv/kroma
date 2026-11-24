import type { RequestContext } from '../../core/http';
import type { SubjectId } from './ids';
import { TitleEdit, type TitleKind } from './schemas';

/** What a person who manages the library writes by hand about a film or a
 * show, in place of the provider's text in every language. Every call needs
 * `library.manage`; the change arrives via the usual item/show update event. */
export function titleEditsApi(ctx: RequestContext) {
  return {
    /** What was written for a title, each field null where it follows the provider. */
    get: (kind: TitleKind, id: SubjectId) =>
      ctx.get('/edits/:kind/:id', TitleEdit, { params: { kind, id } }),

    /** Keep `edit` in place of what was written before. Resolves to the edit as
     * the server kept it: trimmed, each empty field back on the provider. */
    put: (kind: TitleKind, id: SubjectId, edit: TitleEdit) =>
      ctx.put('/edits/:kind/:id', TitleEdit, { params: { kind, id }, body: edit }),
  };
}
