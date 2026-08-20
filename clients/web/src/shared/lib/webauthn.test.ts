// @vitest-environment jsdom

import type { WebAuthnOptions } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasskey, getPasskey, passkeysSupported } from './webauthn';

// Bytes whose base64 spelling contains both characters base64url replaces.
const TRICKY = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x10, 0x83]);
const TRICKY_B64URL = '-_-_ABCD';

const bytes = (buffer: ArrayBuffer | Uint8Array) => [
  ...new Uint8Array(buffer instanceof Uint8Array ? buffer.buffer : buffer),
];

let received: { publicKey: Record<string, unknown> } | null = null;

function sent(): Record<string, unknown> {
  if (!received) throw new Error('navigator.credentials was never called');
  return received.publicKey;
}

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
    // WebAuthn is HTTPS-or-localhost only; a LAN server on plain http reaches this.
    expect(passkeysSupported()).toBe(false);
  });

  it('is false where the browser has no WebAuthn at all', () => {
    support({ PublicKeyCredential: undefined });
    expect(passkeysSupported()).toBe(false);
  });

  it('is false where the credentials API is missing', () => {
    support();
    vi.stubGlobal('navigator', {});
    expect(passkeysSupported()).toBe(false);
  });
});

describe('converting the server’s options for the browser', () => {
  it('decodes the challenge from base64url, not base64', async () => {
    authenticator(attestation(), 'create');
    await createPasskey(creationOptions());
    expect(bytes(sent().challenge as ArrayBuffer)).toEqual([...TRICKY]);
  });

  it('decodes an unpadded string, which is what webauthn-rs sends', async () => {
    authenticator(attestation(), 'create');
    // `atob` refuses a length that is not a multiple of four, so the padding
    // webauthn-rs strips has to be restored first.
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
    expect(user.name).toBe('max');
  });

  it('reaches the id of every excluded credential', async () => {
    authenticator(attestation(), 'create');
    await createPasskey(creationOptions());
    const [excluded] = sent().excludeCredentials as [{ id: ArrayBuffer; transports: string[] }];
    expect(bytes(excluded.id)).toEqual([...TRICKY]);
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

  it('refuses options whose challenge the server left out', async () => {
    authenticator(attestation(), 'create');
    await expect(createPasskey(options({ rp: { id: 'kroma.test' } }))).rejects.toThrow(
      /challenge/i,
    );
  });
});

describe('the registration ceremony', () => {
  it('re-encodes the authenticator’s bytes as unpadded base64url', async () => {
    authenticator(attestation(), 'create');
    const credential = await created(creationOptions());
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
    // getTransports is not universal across browsers.
    authenticator({ ...attestation(), getTransports: undefined }, 'create');
    const credential = await created(creationOptions());
    expect(credential.response.transports).toEqual([]);
  });

  it('throws when the user cancels', async () => {
    authenticator(null, 'create');
    // The browser resolves with null rather than rejecting on cancel.
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
    expect(credential.response.userHandle).toBeNull();
  });

  it('throws when the user cancels', async () => {
    authenticator(null, 'get');
    await expect(getPasskey(options({ challenge: TRICKY_B64URL }))).rejects.toThrow('cancelled');
  });
});
