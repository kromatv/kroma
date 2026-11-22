import type { RequestContext } from '../../core/client';
import { type SetupAdvance, SetupAnswer, type SetupConfirmed, type SetupLine } from './schemas';

/** The guided setup of the owner who made the server's first account. Every
 * call answers the setup as it stands after it. */
export default function setupApi(ctx: RequestContext) {
  return {
    /** The caller's setup, or none. */
    state: () => ctx.get('/admin/setup', SetupAnswer),

    /** The owner is on a step. The furthest step reached never goes back. */
    advance: (body: SetupAdvance) => ctx.put('/admin/setup', SetupAnswer, { body }),

    /** The owner left the setup. What is not done is the checklist from now on. */
    end: () => ctx.post('/admin/setup/end', SetupAnswer),

    /** The owner answered a step that leaves nothing else behind. */
    confirm: (step: SetupConfirmed) =>
      ctx.post('/admin/setup/confirm/:step', SetupAnswer, { params: { step } }),

    /** Takes a line off the checklist for good. */
    dismiss: (step: SetupLine) =>
      ctx.post('/admin/setup/dismiss/:step', SetupAnswer, { params: { step } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    setup: ReturnType<typeof setupApi>;
  }
}
