import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_SCHEMA_VERSION } from '@kromatv/registry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installCommand } from './install';

let dir: string;
const calls: { url: string; method: string; body: Uint8Array | null }[] = [];

function stubServer() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body instanceof Uint8Array ? init.body : null,
      });
      return new Response('{"id":"tv.acme.notes","version":"0.1.0"}', { status: 200 });
    }),
  );
}

const uploaded = () =>
  new TextDecoder().decode(calls.find((c) => c.method === 'POST')?.body ?? new Uint8Array());

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kroma-install-'));
  calls.length = 0;
  mkdirSync(join(dir, 'dist', 'modules'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'modules', 'tv.acme.notes.kmod'), 'component');
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
  it('uploads the one bundle of the module, and asks the server nothing else', async () => {
    stubServer();

    const code = await installCommand({ id: 'tv.acme.notes', cwd: dir });

    expect(code).toBe(0);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['POST', 'http://server.test:4040/api/admin/store/install'],
    ]);
    expect(uploaded()).toBe('component');
  });

  it('takes the module id from the cwd when it is a module', async () => {
    stubServer();
    writeFileSync(
      join(dir, 'module.json'),
      JSON.stringify({
        schemaVersion: MODULE_SCHEMA_VERSION,
        id: 'tv.acme.notes',
        name: 'Notes',
        version: '0.1.0',
      }),
    );

    await installCommand({ cwd: dir });

    expect(uploaded()).toBe('component');
  });

  it('uploads the file it is given, whatever it is named', async () => {
    stubServer();
    const file = join(dir, 'notes-from-ci.kmod');
    writeFileSync(file, 'downloaded');

    await installCommand({ file, cwd: dir });

    expect(uploaded()).toBe('downloaded');
  });

  it('says what to run when nothing was packed for the id', async () => {
    stubServer();

    await expect(installCommand({ id: 'tv.acme.other', cwd: dir })).rejects.toThrow('kroma build');
  });

  it('needs an id when the cwd is not a module and none is given', async () => {
    stubServer();

    await expect(installCommand({ cwd: dir })).rejects.toThrow('usage: kroma install');
  });
});
