import { z } from 'zod';
import type { RequestContext } from '../../core/http';
import { MaturityLevel, type UserId } from '../accounts';

/** `GET /api/admin/users/:id/restrictions`. `held` is `false` for an account
 * with a management right, which no ceiling binds. */
export const Restrictions = z.object({
  level: MaturityLevel,
  held: z.boolean(),
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
  };
}
