import { z } from 'zod';
import type { RequestContext } from '../../core/http';
import { CeremonyId, type PasskeyId } from './ids';
import { AuthResult, PasskeyInfo } from './schemas';

/** Opaque WebAuthn ceremony payloads. Their shape is defined by the platform
 * (`navigator.credentials`), not by us: the web layer converts the binary fields
 * to and from `ArrayBuffer` around these. */
export const WebAuthnOptions = z.object({ publicKey: z.record(z.string(), z.unknown()) });
export type WebAuthnOptions = z.infer<typeof WebAuthnOptions>;
export type WebAuthnCredential = Record<string, unknown>;

/** What a ceremony start hands back: echo `ceremonyId` to the matching finish. */
export const WebAuthnCeremony = z.object({ ceremonyId: CeremonyId, options: WebAuthnOptions });
export type WebAuthnCeremony = z.infer<typeof WebAuthnCeremony>;

/** Passkeys: the WebAuthn registration and passwordless sign-in ceremonies. */
export function passkeysApi(ctx: RequestContext) {
  return {
    /** The account's registered passkeys, newest first. (Bearer.) */
    list: () => ctx.get('/auth/me/passkeys', PasskeyInfo.array()),

    /** Remove one of the account's passkeys by id. (Bearer.) */
    delete: (id: PasskeyId) => ctx.delete('/auth/me/passkeys/:id', { params: { id } }),

    /** Begin registering a passkey. `options` feeds `navigator.credentials.create`. */
    registerStart: () => ctx.post('/auth/me/passkeys/register/start', WebAuthnCeremony),

    /** Finish registering a passkey with the browser's credential. */
    registerFinish: (body: {
      ceremonyId: CeremonyId;
      name: string;
      credential: WebAuthnCredential;
    }) => ctx.post('/auth/me/passkeys/register/finish', PasskeyInfo, { body }),

    /** Begin usernameless (discoverable) passwordless sign-in. `options` feeds
     * `navigator.credentials.get`; the browser lets the user pick which account.
     * Public. */
    authStart: () => ctx.post('/auth/passkeys/authenticate/start', WebAuthnCeremony),

    /** Finish passwordless sign-in with the browser's assertion, giving the same
     * `{ token, accessToken, user }` as a password login. Public. */
    authFinish: (body: { ceremonyId: CeremonyId; credential: WebAuthnCredential }) =>
      ctx.post('/auth/passkeys/authenticate/finish', AuthResult, { body }),
  };
}
