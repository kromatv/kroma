// Passkeys: the WebAuthn registration and passwordless sign-in ceremonies.

import { AuthResult, PasskeyInfo, validate } from '../schemas';
import { JSON_HEADERS, type RequestContext } from './base';

/** Opaque WebAuthn ceremony payloads. Their shape is defined by the platform
 * (`navigator.credentials`), not by us the web layer converts the binary
 * fields to/from `ArrayBuffer` around these. */
export type WebAuthnOptions = { publicKey: Record<string, unknown> };
export type WebAuthnCredential = Record<string, unknown>;

/** Begin registering a passkey → `{ ceremonyId, options }`. `options` feeds
 * `navigator.credentials.create`; echo `ceremonyId` back to finish. (Bearer.) */
export function passkeyRegisterStart(
  ctx: RequestContext,
): Promise<{ ceremonyId: string; options: WebAuthnOptions }> {
  return ctx.json('/auth/me/passkeys/register/start', { method: 'POST' });
}

/** Finish registering a passkey with the browser's credential → the stored
 * {@link PasskeyInfo}. (Bearer.) */
export function passkeyRegisterFinish(
  ctx: RequestContext,
  body: { ceremonyId: string; name: string; credential: WebAuthnCredential },
): Promise<PasskeyInfo> {
  return ctx
    .json<PasskeyInfo>('/auth/me/passkeys/register/finish', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
    .then((r) => validate(PasskeyInfo, r));
}

/** The account's registered passkeys, newest first. (Bearer.) */
export function passkeys(ctx: RequestContext): Promise<PasskeyInfo[]> {
  return ctx.json<PasskeyInfo[]>('/auth/me/passkeys').then((r) => validate(PasskeyInfo.array(), r));
}

/** Remove one of the account's passkeys by id. (Bearer.) */
export async function deletePasskey(ctx: RequestContext, id: string): Promise<void> {
  await ctx.json<void>(`/auth/me/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Begin usernameless (discoverable) passwordless sign-in → `{ ceremonyId,
 * options }`. `options` feeds `navigator.credentials.get`; the browser lets the
 * user pick which account. Public. */
export function passkeyAuthStart(
  ctx: RequestContext,
): Promise<{ ceremonyId: string; options: WebAuthnOptions }> {
  return ctx.json('/auth/passkeys/authenticate/start', { method: 'POST' });
}

/** Finish passwordless sign-in with the browser's assertion → `{ token,
 * accessToken, user }` (same shape as password login). Public. */
export function passkeyAuthFinish(
  ctx: RequestContext,
  body: { ceremonyId: string; credential: WebAuthnCredential },
): Promise<AuthResult> {
  return ctx
    .json<AuthResult>('/auth/passkeys/authenticate/finish', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
    .then((r) => validate(AuthResult, r));
}
