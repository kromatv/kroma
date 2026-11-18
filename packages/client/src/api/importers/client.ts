import type { RequestContext } from '../../core/client';
import type { ModuleId } from '../modules';
import type { ImportServerId, ImportSignInId } from './ids';
import { ImporterList, ImportSignIn, ImportSurvey } from './schemas';

/** The modules that read another media server, and the owner's sign-in to
 * that server through one of them. */
export default function importersApi(ctx: RequestContext) {
  return {
    list: () => ctx.get('/admin/importers', ImporterList),

    /** Sign in to another server with the form the owner filled, by field key. */
    connect: (id: ModuleId, fields: Record<string, string>) =>
      ctx.post('/admin/importers/:id/connect', ImportSignIn, { params: { id }, body: { fields } }),

    /** Ask how a sign-in that answered `pending` stands. Poll until it answers
     * `ready` or `refused`. */
    resume: (id: ModuleId, pending: string) =>
      ctx.post('/admin/importers/:id/connect', ImportSignIn, { params: { id }, body: { pending } }),

    /** What one server of a sign-in holds. */
    survey: (id: ModuleId, signIn: ImportSignInId, server: ImportServerId) =>
      ctx.post('/admin/importers/:id/survey', ImportSurvey, {
        params: { id },
        body: { signIn, server },
      }),

    /** Have the importer delete a sign-in it keeps. */
    forget: (id: ModuleId, signIn: ImportSignInId) =>
      ctx.post('/admin/importers/:id/forget', { params: { id }, body: { signIn } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    importers: ReturnType<typeof importersApi>;
  }
}
