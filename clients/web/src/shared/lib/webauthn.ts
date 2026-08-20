// Browser-side WebAuthn plumbing: the server speaks the webauthn-rs JSON shape
// (binary fields as base64url), `navigator.credentials` speaks ArrayBuffers.
// WebAuthn needs a secure context, so callers gate on `passkeysSupported()`.

import type { WebAuthnCredential, WebAuthnOptions } from '@kroma/core';
import { z } from 'zod';
import { base64UrlToBytes, bytesToBase64Url } from '#web/shared/lib/base64url';

export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    window.PublicKeyCredential !== undefined &&
    !!navigator.credentials?.create
  );
}

const Base64UrlBytes = z.string().transform(base64UrlToBytes);

const CredentialDescriptors = z.array(z.looseObject({ id: Base64UrlBytes })).optional();

const PublicKeyOptions = z.looseObject({
  challenge: Base64UrlBytes,
  user: z.looseObject({ id: Base64UrlBytes }).optional(),
  excludeCredentials: CredentialDescriptors,
  allowCredentials: CredentialDescriptors,
});

function toBufferOptions(
  publicKey: Record<string, unknown>,
): PublicKeyCredentialCreationOptions & PublicKeyCredentialRequestOptions {
  return PublicKeyOptions.parse(publicKey) as unknown as PublicKeyCredentialCreationOptions &
    PublicKeyCredentialRequestOptions;
}

/** Runs the registration ceremony; the result is the JSON `finish` expects. */
export async function createPasskey(options: WebAuthnOptions): Promise<WebAuthnCredential> {
  const publicKey = toBufferOptions(options.publicKey);
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey creation cancelled');
  const res = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: bytesToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: bytesToBase64Url(res.attestationObject),
      clientDataJSON: bytesToBase64Url(res.clientDataJSON),
      transports: res.getTransports?.() ?? [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

/** Runs the authentication ceremony; the result is the JSON `finish` expects. */
export async function getPasskey(options: WebAuthnOptions): Promise<WebAuthnCredential> {
  const publicKey = toBufferOptions(options.publicKey);
  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey request cancelled');
  const res = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bytesToBase64Url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bytesToBase64Url(res.authenticatorData),
      clientDataJSON: bytesToBase64Url(res.clientDataJSON),
      signature: bytesToBase64Url(res.signature),
      userHandle: res.userHandle ? bytesToBase64Url(res.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}
