import type { RequestContext } from '../../core/client';
import { adoptMediaTicket } from '../../core/http';
import type { InviteToken } from '../accounts/ids';
import type { IdentityId, JoinRequestId, ProviderId } from './ids';
import {
  Discovered,
  type FlowKeys,
  type FlowReturn,
  FlowResult,
  FlowStarted,
  IdentityInfo,
  type JoinApproval,
  JoinApproved,
  JoinRequests,
  SignInAdmin,
  type SignInSave,
} from './schemas';

/** Signing in through an OpenID Connect provider, and the admin's side of it. */
export default function ssoApi(ctx: RequestContext) {
  return {
    /** Begin a sign-in at `provider`. Pass `invite` when the person arrived on
     * an invitation link. Public. */
    start: (provider: ProviderId, options: { invite?: InviteToken; from?: FlowReturn } = {}) =>
      ctx.post('/auth/sso/start', FlowStarted, {
        auth: 'public',
        body: { provider, invite: options.invite, ...options.from },
      }),

    /** Collect how a flow ended. A sign-in answers with what a password login
     * returns, under `status: 'signedIn'`. Rejects 404 for a flow that lapsed,
     * was already collected, or whose keys are wrong. Public. */
    finish: (keys: FlowKeys) =>
      adoptMediaTicket(
        ctx,
        ctx.post('/auth/sso/finish', FlowResult, { auth: 'public', body: keys }),
      ),

    /** Link the identity of a flow that ended without an account to the
     * signed-in account. (Bearer.) */
    claim: (keys: FlowKeys) => ctx.post('/auth/sso/claim', { body: keys }),

    /** The account's provider identities, newest first. (Bearer.) */
    identities: () => ctx.get('/auth/me/identities', IdentityInfo.array()),

    /** Begin a flow that ends with the identity on the signed-in account. (Bearer.) */
    link: (provider: ProviderId, from?: FlowReturn) =>
      ctx.post('/auth/me/identities', FlowStarted, { body: { provider, ...from } }),

    /** Rejects 409 when it is the account's last way to sign in. (Bearer.) */
    unlink: (id: IdentityId) => ctx.delete('/auth/me/identities/:id', { params: { id } }),

    /** The sign-in configuration. Secrets are never returned. */
    config: () => ctx.get('/admin/sign-in', SignInAdmin),

    /** Rejects 409 when passwords would go off with no live provider. */
    save: (body: SignInSave) => ctx.put('/admin/sign-in', { body }),

    /** Read a provider's address before saving it. Never rejects on a bad
     * address: failures come back as `{ ok: false, reason }`. */
    discover: (issuer: string) =>
      ctx.post('/admin/sign-in/discover', Discovered, { body: { issuer } }),

    /** Give a saved provider's button a picture: a PNG, a JPEG, a WebP or an
     * SVG of at most 256 KiB. Rejects 415 for anything else. */
    uploadImage: (provider: ProviderId, image: Blob) =>
      ctx.upload('/admin/sign-in/methods/:id/image', image, { params: { id: provider } }),

    /** Take the uploaded picture away: the button goes back to its preset's
     * logo, or to its icon. */
    removeImage: (provider: ProviderId) =>
      ctx.delete('/admin/sign-in/methods/:id/image', { params: { id: provider } }),

    /** Begin a test sign-in at a saved provider. A flow that comes back
     * verified takes the provider live. */
    test: (provider: ProviderId) =>
      ctx.post('/admin/sign-in/test', FlowStarted, { body: { provider } }),

    joinRequests: () => ctx.get('/admin/join-requests', JoinRequests),

    /** Create the account a waiting request asked for. */
    approve: (id: JoinRequestId, approval: JoinApproval) =>
      ctx.post('/admin/join-requests/:id/approve', JoinApproved, {
        params: { id },
        body: approval,
      }),

    /** Decline a request: its identity cannot ask again until it is forgotten. */
    decline: (id: JoinRequestId) =>
      ctx.post('/admin/join-requests/:id/decline', { params: { id } }),

    /** Forget a request, waiting or declined. */
    forget: (id: JoinRequestId) => ctx.delete('/admin/join-requests/:id', { params: { id } }),
  };
}

declare module '../../core/client' {
  interface Domains {
    sso: ReturnType<typeof ssoApi>;
  }
}
