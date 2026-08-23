import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson, fetchText } from './http';

const System = z.object({ name: z.string() });
const url = 'http://192.168.1.34:1925/6/system';

const answering = (body: string, init?: ResponseInit) =>
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(body, init)));

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson', () => {
  it('parses a body the television answered and the schema accepts', async () => {
    answering('{"name":"55PUS7304/12"}');

    expect(await fetchJson(url, System)).toEqual({ name: '55PUS7304/12' });
  });

  it('answers nothing when the television refuses the request', async () => {
    answering('{"name":"55PUS7304/12"}', { status: 403 });

    expect(await fetchJson(url, System)).toBeNull();
  });

  it('answers nothing when the body is not the shape that was asked for', async () => {
    answering('{"name":42}');

    expect(await fetchJson(url, System)).toBeNull();
  });

  it('answers nothing when the body runs past the byte ceiling', async () => {
    answering(JSON.stringify({ name: 'x'.repeat(4096) }));

    expect(await fetchJson(url, System, { maxBytes: 512 })).toBeNull();
  });

  it('answers nothing when the body is not JSON at all', async () => {
    answering('<html>404 Not Found</html>');

    expect(await fetchJson(url, System)).toBeNull();
  });
});

describe('fetchText', () => {
  it('answers the body the television sent back', async () => {
    answering('<root><device /></root>');

    expect(await fetchText(url)).toBe('<root><device /></root>');
  });

  it('answers nothing when the television is unreachable', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));

    expect(await fetchText(url)).toBeNull();
  });

  it('answers nothing when the television announces a body past the ceiling', async () => {
    answering('<root />', { headers: { 'content-length': '99999' } });

    expect(await fetchText(url, { maxBytes: 512 })).toBeNull();
  });

  it('answers nothing when the answer carries no body at all', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 204 })));

    expect(await fetchText(url)).toBeNull();
  });

  it('accepts the certificate a television signed for itself when asked to', async () => {
    const asked: unknown[] = [];
    vi.stubGlobal('fetch', (_url: string, init: unknown) => {
      asked.push(init);
      return Promise.resolve(new Response('<root />'));
    });

    await fetchText(url, { insecureTls: true });

    expect(asked[0]).toMatchObject({ tls: { rejectUnauthorized: false } });
  });
});
