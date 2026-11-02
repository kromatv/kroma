import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { resolveServer, type Server, uploadBundle } from './server';

const work = mkdtempSync(join(tmpdir(), 'kroma-server-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('resolveServer', () => {
  let written = 0;

  const stored = (config: object) => {
    written += 1;
    const path = join(work, `cli-${written}.json`);
    writeFileSync(path, JSON.stringify(config));
    vi.stubEnv('KROMA_CLI_CONFIG', path);
  };

  const login = {
    defaultServer: 'http://stored:4040',
    servers: { 'http://stored:4040': { token: 'stored-token' } },
  };

  it('takes the flags over the environment and the stored login', () => {
    stored(login);
    vi.stubEnv('KROMA_SERVER', 'http://env:4040');
    vi.stubEnv('KROMA_TOKEN', 'env-token');

    expect(resolveServer({ server: 'flag:4040', token: 'flag-token' })).toEqual({
      url: 'http://flag:4040',
      token: 'flag-token',
    });
  });

  it('falls back to KROMA_SERVER and KROMA_TOKEN', () => {
    stored(login);
    vi.stubEnv('KROMA_SERVER', 'http://env:4040/');
    vi.stubEnv('KROMA_TOKEN', 'env-token');

    expect(resolveServer({})).toEqual({ url: 'http://env:4040', token: 'env-token' });
  });

  it('falls back to the server the last login was run against, and its token', () => {
    stored(login);
    vi.stubEnv('KROMA_SERVER', undefined);
    vi.stubEnv('KROMA_TOKEN', undefined);

    expect(resolveServer({})).toEqual({ url: 'http://stored:4040', token: 'stored-token' });
  });

  it('ends at localhost, whose token it still reads off the login store', () => {
    stored({ servers: { 'http://localhost:4040': { token: 'local-token' } } });
    vi.stubEnv('KROMA_SERVER', undefined);
    vi.stubEnv('KROMA_TOKEN', undefined);

    expect(resolveServer({})).toEqual({ url: 'http://localhost:4040', token: 'local-token' });
  });

  it('refuses to run without a token, naming the login that would get one', () => {
    stored({ servers: {} });
    vi.stubEnv('KROMA_SERVER', undefined);
    vi.stubEnv('KROMA_TOKEN', undefined);

    expect(() => resolveServer({})).toThrow('kroma login http://localhost:4040');
  });
});

const SERVER: Server = { url: 'http://localhost:4040', token: 'tok' };

describe('uploadBundle', () => {
  const bundle = () => {
    const path = join(work, 'tv.kroma.notes.kmod');
    writeFileSync(path, 'kmod bytes');
    return path;
  };

  it('posts the bundle and gives back what the server answered', async () => {
    let sent = '';
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent = await new Request(url, init).text();
      return new Response('installed tv.kroma.notes@1.2.0');
    });

    const said = await uploadBundle(SERVER, bundle());

    expect(said).toBe('installed tv.kroma.notes@1.2.0');
    expect(sent).toBe('kmod bytes');
  });

  it('throws with the status and the body when the install is refused', async () => {
    vi.stubGlobal('fetch', async () => new Response('not a manifest', { status: 400 }));

    await expect(uploadBundle(SERVER, bundle())).rejects.toThrow(
      'install failed (400): not a manifest',
    );
  });
});
