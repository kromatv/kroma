import { z } from 'zod';
import type { RequestContext } from '../../core/http';
import { MaturityLevel, type UserId } from '../accounts';

/** A title blocked or allowed for one profile: kept from it whatever its
 * rating, or let through its ceiling rated or not. */
export const TitleRule = z.enum(['block', 'allow']);
export type TitleRule = z.infer<typeof TitleRule>;

/** A film or a show that carries a rule; a show's covers its episodes. */
export const RuledTitle = z.object({
  id: z.string().nonempty(),
  name: z.string(),
  kind: z.enum(['movie', 'show']),
  rule: TitleRule,
});
export type RuledTitle = z.infer<typeof RuledTitle>;

/** `GET /api/admin/users/:id/restrictions`. `held` is `false` for an account
 * with a management right, which neither a ceiling nor a block binds; `titles`
 * lists the ruled titles, newest first. */
export const Restrictions = z.object({
  level: MaturityLevel,
  held: z.boolean(),
  titles: z.array(RuledTitle).default([]),
});
export type Restrictions = z.infer<typeof Restrictions>;

/** What an admin keeps from another profile. Every change carries the admin's
 * own password, which the server checks each time. */
export function restrictionsApi(ctx: RequestContext) {
  return {
    get: (id: UserId) => ctx.get('/admin/users/:id/restrictions', Restrictions, { params: { id } }),

    setLevel: (id: UserId, level: MaturityLevel, password: string) =>
      ctx.put('/admin/users/:id/restrictions/level', {
        params: { id },
        body: { level, password },
      }),

    /** `rule: null` lifts the title's rule. */
    setTitleRule: (
      id: UserId,
      change: { title: string; rule: TitleRule | null },
      password: string,
    ) =>
      ctx.put('/admin/users/:id/restrictions/titles/:title', {
        params: { id, title: change.title },
        body: { rule: change.rule, password },
      }),
  };
}
