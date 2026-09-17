import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHALLENGE_PATH, provesOrigin } from './challenge';
import { keypair, sign } from './test-support';

afterEach(() => {
  vi.unstubAllGlobals();
});

function answering(privateKey: CryptoKey | null, status = 200, body?: string) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      const nonce = new URL(String(url)).searchParams.get('nonce') ?? '';
      const answer =
        body ??
        JSON.stringify({
          nonce,
          signature: privateKey ? await sign(privateKey, nonce) : 'x'.repeat(86),
        });
      return new Response(answer, { status });
    }),
  );
  return calls;
}

describe('proving an origin', () => {
  it('asks a public origin to sign a fresh nonce at the fixed path, following no redirect', async () => {
    const { publicKey, privateKey } = await keypair();
    const calls = answering(privateKey);

    expect(await provesOrigin('https://kroma.example', publicKey)).toBe(true);
    expect(calls[0]?.url.startsWith(`https://kroma.example${CHALLENGE_PATH}?nonce=`)).toBe(true);
    expect(calls[0]?.init.redirect).toBe('manual');
  });

  it('takes a private origin at its word without asking', async () => {
    const { publicKey } = await keypair();
    const calls = answering(null);

    expect(await provesOrigin('http://192.168.1.20:4040', publicKey)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('refuses an answer signed by another key, a wrong nonce, or no answer', async () => {
    const { publicKey } = await keypair();
    const other = await keypair();

    answering(other.privateKey);
    expect(await provesOrigin('https://kroma.example', publicKey)).toBe(false);
    answering(null, 200, JSON.stringify({ nonce: 'stale', signature: 'x'.repeat(86) }));
    expect(await provesOrigin('https://kroma.example', publicKey)).toBe(false);
    answering(null, 404);
    expect(await provesOrigin('https://kroma.example', publicKey)).toBe(false);
    answering(null, 200, 'not json');
    expect(await provesOrigin('https://kroma.example', publicKey)).toBe(false);
  });

  it('refuses an answer it would have to buffer, and one that never comes', async () => {
    const { publicKey } = await keypair();

    answering(null, 200, 'x'.repeat(5000));
    expect(await provesOrigin('https://kroma.example', publicKey)).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('unreachable'))),
    );
    expect(await provesOrigin('https://kroma.example', publicKey)).toBe(false);
  });
});
