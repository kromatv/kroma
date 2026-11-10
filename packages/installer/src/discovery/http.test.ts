import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { selfSignedCertificate, toPem } from '../platforms/tizen/certificate/x509';
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
});

describe('fetchText from a set that signed its own certificate', () => {
  let server: Server;
  let origin = '';

  beforeAll(async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const certificate = selfSignedCertificate({
      subject: { commonName: 'Philips TV', organization: 'TP Vision' },
      publicKey,
      privateKey,
      days: 1,
    });
    server = createServer(
      {
        key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
        cert: toPem(certificate, 'CERTIFICATE'),
      },
      (request, response) => {
        response.statusCode = request.url === '/missing' ? 404 : 200;
        response.end(request.url === '/big' ? 'x'.repeat(4096) : '{"name":"55PUS7304/12"}');
      },
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('reads the answer when asked to accept that certificate', async () => {
    expect(await fetchText(`${origin}/6/system`, { insecureTls: true })).toBe(
      '{"name":"55PUS7304/12"}',
    );
  });

  it('refuses that certificate when nothing asked to accept it', async () => {
    expect(await fetchText(`${origin}/6/system`)).toBeNull();
  });

  it('answers nothing when the set refuses the request', async () => {
    expect(await fetchText(`${origin}/missing`, { insecureTls: true })).toBeNull();
  });

  it('stops reading an answer past the size it would take', async () => {
    expect(await fetchText(`${origin}/big`, { insecureTls: true, maxBytes: 512 })).toBeNull();
  });

  it('answers nothing when no set listens there', async () => {
    expect(await fetchText('https://127.0.0.1:1/6/system', { insecureTls: true })).toBeNull();
  });

  it('answers nothing for an address that is not https at all', async () => {
    expect(await fetchText('http://127.0.0.1:1/6/system', { insecureTls: true })).toBeNull();
  });
});
