// @vitest-environment jsdom
//
// The WebAuthn bridge: the server speaks webauthn-rs JSON (binary fields as
// base64url strings), `navigator.credentials` speaks ArrayBuffers, and these
// helpers are the only place the two meet.
//
// Every failure mode here looks identical from the outside - the browser refuses
// the ceremony, or the server rejects the result - so the conversion is worth
// pinning byte for byte:
//
//   - base64url is NOT base64. `-` and `_` stand in for `+` and `/`, and a
//     challenge containing either byte is common enough to reach a real user
//     rather than a test. Decoding it as plain base64 yields a different
//     challenge, and the assertion fails signature verification server-side.
//   - The input is padded and the output is not. webauthn-rs strips `=`, and
//     `atob` refuses a string whose length is not a multiple of four, so the
//     padding has to be put back before decoding and taken off after encoding.
//   - Three different fields carry binary and they are nested differently:
//     `challenge` at the top, `user.id` one level down, and the id of every
//     entry in `excludeCredentials` / `allowCredentials`. Missing one leaves a
//     base64url STRING where the browser wants a buffer, and Chrome throws a
//     TypeError naming only the option object.

import type { WebAuthnOptions } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasskey, getPasskey, passkeysSupported } from './webauthn';

/** Bytes whose base64 spelling contains BOTH characters base64url replaces. */
const TRICKY = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x10, 0x83]);
/** The same bytes, base64url, unpadded - which is what the server sends. */
const TRICKY_B64URL = '-_-_ABCD';

const bytes = (buffer: ArrayBuffer | Uint8Array) => [
  ...new Uint8Array(buffer instanceof Uint8Array ? buffer.buffer : buffer),
];

/** What `navigator.credentials.*` was handed. */
let received: { publicKey: Record<string, unknown> } | null = null;

/** The options the browser actually got. Throws rather than optional-chaining,
 *  so "the ceremony never ran" reads differently from "the field was wrong". */
function sent(): Record<string, unknown> {
  if (!received) throw new Error('navigator.credentials was never called');
  return received.publicKey;
}

/** The credential JSON as the server will read it. `WebAuthnCredential` is an
 *  open record, so its shape is stated once here instead of per assertion. */
interface SentCredential {
  id: string;
  rawId: string;
  type: string;
  response: Record<string, unknown>;
  clientExtensionResults: unknown;
}

const created = async (options: WebAuthnOptions) =>
  (await createPasskey(options)) as unknown as SentCredential;
const asserted = async (options: WebAuthnOptions) =>
  (await getPasskey(options)) as unknown as SentCredential;

/** Install a fake authenticator that answers with `response`. */
function authenticator(response: Record<string, unknown> | null, method: 'create' | 'get') {
  received = null;
  const credential = response && {
    id: 'cred-id',
    type: 'public-key',
    rawId: TRICKY.buffer,
    response,
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
  };
  vi.stubGlobal('navigator', {
    credentials: {
      [method]: vi.fn(async (options: { publicKey: Record<string, unknown> }) => {
        received = options;
        return credential;
      }),
    },
  });
}

const options = (publicKey: Record<string, unknown>) => ({ publicKey }) as WebAuthnOptions;

/** A minimal but complete creation options blob, as webauthn-rs sends it. */
const creationOptions = () =>
  options({
    challenge: TRICKY_B64URL,
    rp: { id: 'kroma.test', name: 'KROMA' },
    user: { id: TRICKY_B64URL, name: 'max', displayName: 'Max' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    excludeCredentials: [{ type: 'public-key', id: TRICKY_B64URL, transports: ['internal'] }],
  });

const attestation = () => ({
  attestationObject: TRICKY.buffer,
  clientDataJSON: TRICKY.buffer,
  getTransports: () => ['internal', 'hybrid'],
});

const assertion = (userHandle: ArrayBuffer | null = TRICKY.buffer) => ({
  authenticatorData: TRICKY.buffer,
  clientDataJSON: TRICKY.buffer,
  signature: TRICKY.buffer,
  userHandle,
});

beforeEach(() => {
  received = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('passkeysSupported', () => {
  const support = (over: Record<string, unknown> = {}) => {
    vi.stubGlobal('window', {
      isSecureContext: true,
      PublicKeyCredential: class {},
      ...over,
    });
    vi.stubGlobal('navigator', { credentials: { create: vi.fn() } });
  };

  it('is true where a ceremony can actually run', () => {
    support();
    expect(passkeysSupported()).toBe(true);
  });

  it('is false outside a secure context', () => {
    support({ isSecureContext: false });
    // WebAuthn is HTTPS-or-localhost only. A LAN server on plain http reaches
    // this, and the caller has to hide the button rather than throw.
    expect(passkeysSupported()).toBe(false);
  });

  it('is false where the browser has no WebAuthn at all', () => {
    support({ PublicKeyCredential: undefined });
    expect(passkeysSupported()).toBe(false);
  });

  it('is false where the credentials API is missing', () => {
    support();
    vi.stubGlobal('navigator', {});
    // Optional-chained, so this must answer false rather than throwing.
    expect(passkeysSupported()).toBe(false);
  });
});

describe('converting the server’s options for the browser', () => {
  it('decodes the challenge from base64url, not base64', async () => {
    authenticator(attestation(), 'create');
    await createPasskey(creationOptions());
    // `-` and `_` are the whole point: read as plain base64 these are different
    // bytes, and the server rejects the signature over them.
    expect(bytes(sent().challenge as ArrayBuffer)).toEqual([...TRICKY]);
  });

  it('decodes an unpadded string, which is what webauthn-rs sends', async () => {
    authenticator(attestation(), 'create');
    // 6 bytes -> 8 base64 chars, no `=`. `atob` refuses a length that is not a
    // multiple of four, so the padding has to be restored first.
    await createPasskey(options({ challenge: 'AQIDBAUG' }));
    expect(bytes(sent().challenge as ArrayBuffer)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('decodes a length that needs one and two pad characters', async () => {
    authenticator(attestation(), 'create');
    await createPasskey(options({ challenge: 'AQID' }));
    expect(bytes(sent().challenge as ArrayBuffer)).toEqual([1, 2, 3]);

    await createPasskey(options({ challenge: 'AQI' }));
    expect(bytes(sent().challenge as ArrayBuffer)).toEqual([1, 2]);

    await createPasskey(options({ challenge: 'AQ' }));
    expect(bytes(sent().challenge as ArrayBuffer)).toEqual([1]);
  });

  it('reaches the user id one level down', async () => {
    authenticator(attestation(), 'create');
    await createPasskey(creationOptions());
    const user = sent().user as { id: ArrayBuffer; name: string };
    expect(bytes(user.id)).toEqual([...TRICKY]);
    // And leaves the rest of the user alone.
    expect(user.name).toBe('max');
  });

  it('reaches the id of every excluded credential', async () => {
    authenticator(attestation(), 'create');
    await createPasskey(creationOptions());
    const [excluded] = sent().excludeCredentials as [{ id: ArrayBuffer; transports: string[] }];
    expect(bytes(excluded.id)).toEqual([...TRICKY]);
    // The other fields of the descriptor survive: dropping `transports` costs
    // the browser its hint about where to look for the key.
    expect(excluded.transports).toEqual(['internal']);
  });

  it('reaches the id of every allowed credential', async () => {
    authenticator(assertion(), 'get');
    await getPasskey(
      options({
        challenge: TRICKY_B64URL,
        allowCredentials: [{ type: 'public-key', id: TRICKY_B64URL }],
      }),
    );
    const [allowed] = sent().allowCredentials as [{ id: ArrayBuffer }];
    expect(bytes(allowed.id)).toEqual([...TRICKY]);
  });

  it('passes everything that is not binary straight through', async () => {
    authenticator(attestation(), 'create');
    await createPasskey(creationOptions());
    expect(sent().rp).toEqual({ id: 'kroma.test', name: 'KROMA' });
    expect(sent().pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }]);
  });

  it('does not mutate the options it was given', async () => {
    authenticator(attestation(), 'create');
    const original = creationOptions();
    await createPasskey(original);
    // The caller holds this object across a retry; turning its strings into
    // buffers in place makes the second attempt decode a buffer.
    expect(original.publicKey.challenge).toBe(TRICKY_B64URL);
    expect((original.publicKey.user as { id: string }).id).toBe(TRICKY_B64URL);
  });

  it('leaves the credential lists absent when the server omits them', async () => {
    authenticator(attestation(), 'create');
    await createPasskey(options({ challenge: TRICKY_B64URL }));
    // Not an empty array: an empty allowCredentials means "no key may be used".
    expect(received?.publicKey).not.toHaveProperty('excludeCredentials');
    expect(received?.publicKey).not.toHaveProperty('allowCredentials');
    expect(received?.publicKey).not.toHaveProperty('user');
  });
});

describe('the registration ceremony', () => {
  it('re-encodes the authenticator’s bytes as unpadded base64url', async () => {
    authenticator(attestation(), 'create');
    const credential = await created(creationOptions());
    // Round trip: what came out is exactly what the server would have sent in.
    expect(credential.rawId).toBe(TRICKY_B64URL);
    expect(credential.response.attestationObject).toBe(TRICKY_B64URL);
    expect(credential.response.clientDataJSON).toBe(TRICKY_B64URL);
    expect(credential.rawId).not.toContain('=');
  });

  it('carries the id, the type and the extension results', async () => {
    authenticator(attestation(), 'create');
    const credential = await created(creationOptions());
    expect(credential.id).toBe('cred-id');
    expect(credential.type).toBe('public-key');
    expect(credential.clientExtensionResults).toEqual({ credProps: { rk: true } });
  });

  it('reports the transports the authenticator offers', async () => {
    authenticator(attestation(), 'create');
    const credential = await created(creationOptions());
    expect(credential.response.transports).toEqual(['internal', 'hybrid']);
  });

  it('reports no transports where the browser cannot say', async () => {
    // getTransports is not universal; its absence must not throw mid-ceremony.
    authenticator({ ...attestation(), getTransports: undefined }, 'create');
    const credential = await created(creationOptions());
    expect(credential.response.transports).toEqual([]);
  });

  it('throws when the user cancels', async () => {
    authenticator(null, 'create');
    // The browser resolves with null rather than rejecting, so a caller that
    // only catches would carry a null credential to the server.
    await expect(createPasskey(creationOptions())).rejects.toThrow('cancelled');
  });
});

describe('the authentication ceremony', () => {
  it('re-encodes every binary field of the assertion', async () => {
    authenticator(assertion(), 'get');
    const credential = await asserted(options({ challenge: TRICKY_B64URL }));
    expect(credential.response.authenticatorData).toBe(TRICKY_B64URL);
    expect(credential.response.clientDataJSON).toBe(TRICKY_B64URL);
    expect(credential.response.signature).toBe(TRICKY_B64URL);
    expect(credential.response.userHandle).toBe(TRICKY_B64URL);
  });

  it('reports a null user handle rather than an empty string', async () => {
    authenticator(assertion(null), 'get');
    const credential = await asserted(options({ challenge: TRICKY_B64URL }));
    // A discoverable-credential login has no handle; '' would read as one.
    expect(credential.response.userHandle).toBeNull();
  });

  it('throws when the user cancels', async () => {
    authenticator(null, 'get');
    await expect(getPasskey(options({ challenge: TRICKY_B64URL }))).rejects.toThrow('cancelled');
  });
});
