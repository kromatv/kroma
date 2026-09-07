import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installCommand } from './install';

let dir: string;
const calls: { url: string; method: string; body: Uint8Array | null }[] = [];

function stubServer(target: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body instanceof Uint8Array ? init.body : null,
      });
      if (url.endsWith('/api/admin/store/platform')) {
        return target
          ? Response.json({ target, serverVersion: '0.1.40' })
          : new Response('', { status: 404 });
      }
      return new Response('{"id":"tv.acme.notes","version":"0.1.0"}', { status: 200 });
    }),
  );
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kroma-install-'));
  calls.length = 0;
  mkdirSync(join(dir, 'dist', 'modules'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'modules', 'tv.acme.notes-aarch64-apple-darwin.kmod'), 'mac');
  writeFileSync(
    join(dir, 'dist', 'modules', 'tv.acme.notes-x86_64-unknown-linux-musl.kmod'),
    'linux',
  );
  vi.stubEnv('KROMA_TOKEN', 'tok');
  vi.stubEnv('KROMA_SERVER', 'http://server.test:4040/');
  vi.stubEnv('KROMA_CLI_CONFIG', join(dir, 'none.json'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('installCommand', () => {
  it("uploads the bundle built for the server's platform", async () => {
    stubServer('x86_64-unknown-linux-musl');

    const code = await installCommand({ id: 'tv.acme.notes', cwd: dir });

    expect(code).toBe(0);
    const upload = calls.find((c) => c.method === 'POST');
    expect(upload?.url).toBe('http://server.test:4040/api/admin/store/install');
    expect(new TextDecoder().decode(upload?.body ?? new Uint8Array())).toBe('linux');
  });

  it('takes the module id from the cwd when it is a module', async () => {
    stubServer('aarch64-apple-darwin');
    writeFileSync(
      join(dir, 'module.json'),
      JSON.stringify({ schemaVersion: 2, id: 'tv.acme.notes', name: 'Notes', version: '0.1.0' }),
    );

    await installCommand({ cwd: dir });

    const upload = calls.find((c) => c.method === 'POST');
    expect(new TextDecoder().decode(upload?.body ?? new Uint8Array())).toBe('mac');
  });

  it('refuses a bundle built for another platform and names the flag', async () => {
    stubServer('x86_64-unknown-linux-musl');

    await expect(
      installCommand({
        file: join(dir, 'dist', 'modules', 'tv.acme.notes-aarch64-apple-darwin.kmod'),
        cwd: dir,
      }),
    ).rejects.toThrow('--target x86_64-unknown-linux-musl');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('uploads whatever matches this machine when the server is too old to say', async () => {
    stubServer(null);

    const code = await installCommand({ id: 'tv.acme.notes', cwd: dir });

    expect(code).toBe(0);
    expect(calls.some((c) => c.method === 'POST')).toBe(true);
  });

  it('says what to run when nothing was packed for the id', async () => {
    stubServer('aarch64-apple-darwin');

    await expect(installCommand({ id: 'tv.acme.other', cwd: dir })).rejects.toThrow('kroma build');
  });

  it('needs an id when the cwd is not a module and none is given', async () => {
    stubServer('aarch64-apple-darwin');

    await expect(installCommand({ cwd: dir })).rejects.toThrow('usage: kroma install');
  });
});
