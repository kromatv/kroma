import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBody } from './fetch-body.ts';

const URL = 'https://modules.kroma.test/modules.json';
const options = { timeoutMs: 1000, maxBytes: 64, backoffMs: 0 };

const reset = () => new TypeError('fetch failed', { cause: new Error('ECONNRESET') });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchBody', () => {
  it('retries a connection failure and returns the body that follows', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(reset())
      .mockResolvedValueOnce(new Response('{"modules":[]}'));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchBody(URL, options)).resolves.toBe('{"modules":[]}');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt and names the cause fetch swallowed', async () => {
    const fetch = vi.fn().mockRejectedValue(reset());
    vi.stubGlobal('fetch', fetch);

    const failure = fetchBody(URL, options);

    await expect(failure).rejects.toThrow(
      `${URL} could not be read after 3 attempts: fetch failed: ECONNRESET`,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('retries a status the origin may answer differently', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchBody(URL, options)).resolves.toBe('ok');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks once for a status that will not change', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetch);

    const failure = fetchBody(URL, options);

    await expect(failure).rejects.toThrow(`${URL} answered 404`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a body over the ceiling without asking again', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('x'.repeat(65)));
    vi.stubGlobal('fetch', fetch);

    const failure = fetchBody(URL, options);

    await expect(failure).rejects.toThrow('returned 65 bytes, over the 64 ceiling');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('carries the headers the caller passed', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetch);

    await fetchBody(URL, { ...options, headers: { authorization: 'Bearer t' } });

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: 'Bearer t' } });
  });
});
