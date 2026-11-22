import { z } from 'zod';
import { adoptMediaTicket, type RequestContext } from '../../core/http';
import { UserId } from './ids';
import { AuthResult } from './schemas';

/** A Kids profile as a picker draws it: no credential, opened with a member's. */
export const KidsProfile = z.object({
  id: UserId,
  username: z.string(),
  avatarUrl: z.string().nullish(),
});
export type KidsProfile = z.infer<typeof KidsProfile>;

const KidsProfiles = z.object({ profiles: z.array(KidsProfile) });

/** The Kids profiles a device opens from its picker. Both calls present the
 * access token of a member signed in on this device; the server refuses a
 * Kids profile's own. */
export function kidsApi(ctx: RequestContext) {
  return {
    list: async (memberAccess: string) =>
      (
        await ctx.post('/kids/list', KidsProfiles, {
          auth: 'public',
          body: { accessToken: memberAccess },
        })
      ).profiles,

    /** A session of the Kids profile, bound to this device. */
    open: (memberAccess: string, profile: UserId) =>
      adoptMediaTicket(
        ctx,
        ctx.post('/kids/open', AuthResult, {
          auth: 'public',
          body: { accessToken: memberAccess, profile },
        }),
      ),
  };
}
