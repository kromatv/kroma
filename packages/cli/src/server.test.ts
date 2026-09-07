import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  bundleFor,
  bundleRunsOn,
  hostTriplePart,
  resolveServer,
  type Server,
  serverPlatform,
  uploadBundle,
} from './server';

const work = mkdtempSync(join(tmpdir(), 'kroma-server-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('bundleFor', () => {
  const files = [
    'tv.kroma.vpn-aarch64-apple-darwin.kmod',
    'tv.kroma.vpn-x86_64-unknown-linux-musl.kmod',
    'tv.kroma.scene.kmod',
    'tv.kroma.vpnx-aarch64-apple-darwin.kmod',
  ];

  it('takes the universal bundle when a module ships one', () => {
    expect(bundleFor(files, 'tv.kroma.scene')).toBe('tv.kroma.scene.kmod');
  });

  it("takes this machine's build over a cross-compiled one", () => {
    expect(bundleFor(files, 'tv.kroma.vpn', hostTriplePart('arm64', 'darwin'))).toBe(
      'tv.kroma.vpn-aarch64-apple-darwin.kmod',
    );
    expect(bundleFor(files, 'tv.kroma.vpn', hostTriplePart('x64', 'linux'))).toBe(
      'tv.kroma.vpn-x86_64-unknown-linux-musl.kmod',
    );
  });

  it('does not hand an arm Mac an aarch64 LINUX build', () => {
    // Matching on arch alone did exactly that.
    const linuxOnly = ['tv.kroma.vpn-aarch64-unknown-linux-musl.kmod'];
    expect(bundleFor(linuxOnly, 'tv.kroma.vpn', hostTriplePart('arm64', 'darwin'))).toBe(
      // Nothing matches the host, so the only build there is offered and the
      // server decides - but it is not claimed to be this machine's.
      'tv.kroma.vpn-aarch64-unknown-linux-musl.kmod',
    );
    expect(hostTriplePart('arm64', 'darwin')).toBe('aarch64-apple-darwin');
    expect(hostTriplePart('arm64', 'linux')).toBe('aarch64-unknown-linux');
  });

  it('does not mistake a longer id that starts the same', () => {
    // `tv.kroma.vpnx` must not be offered as a build of `tv.kroma.vpn`.
    expect(bundleFor(['tv.kroma.vpnx-aarch64-apple-darwin.kmod'], 'tv.kroma.vpn')).toBeUndefined();
  });

  it('is undefined when nothing was packed for it', () => {
    expect(bundleFor(files, 'tv.kroma.nope')).toBeUndefined();
  });
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

describe('bundleRunsOn', () => {
  const darwin = { target: 'aarch64-apple-darwin', serverVersion: '0.1.9' };

  it('runs a universal bundle on anything', () => {
    expect(bundleRunsOn('tv.kroma.scene.kmod', darwin)).toBe(true);
  });

  it('runs a sidecar only on the platform it was built for', () => {
    expect(bundleRunsOn('tv.kroma.vpn-aarch64-apple-darwin.kmod', darwin)).toBe(true);
    expect(bundleRunsOn('tv.kroma.vpn-x86_64-unknown-linux-musl.kmod', darwin)).toBe(false);
  });

  it('takes any bundle when the server does not say what it runs on', () => {
    expect(bundleRunsOn('tv.kroma.vpn-x86_64-unknown-linux-musl.kmod', null)).toBe(true);
  });
});

const SERVER: Server = { url: 'http://localhost:4040', token: 'tok' };

describe('serverPlatform', () => {
  it('reads the triple and the version the server reports', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ target: 'aarch64-apple-darwin', serverVersion: '0.1.9' }),
    );
    vi.stubGlobal('fetch', fetch);

    const platform = await serverPlatform(SERVER);

    expect(platform).toEqual({ target: 'aarch64-apple-darwin', serverVersion: '0.1.9' });
    expect(fetch).toHaveBeenCalledWith('http://localhost:4040/api/admin/store/platform', {
      headers: { authorization: 'Bearer tok' },
    });
  });

  it.each([404, 405])('is null on a server too old to answer, which says %i', async (status) => {
    vi.stubGlobal('fetch', async () => new Response('', { status }));

    await expect(serverPlatform(SERVER)).resolves.toBeNull();
  });

  it('throws when the server fails the request outright', async () => {
    vi.stubGlobal('fetch', async () => new Response('boom', { status: 500 }));

    await expect(serverPlatform(SERVER)).rejects.toThrow(/platform failed \(500\)/);
  });
});

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
