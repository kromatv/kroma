import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_SCHEMA_VERSION } from '@kroma/registry';
import { describe, expect, it } from 'vitest';
import { registryApp } from './serve';

// A `.kmod` is a zstd tar; ustar headers are 512-byte blocks with the name at 0
// and the size as octal at 124.
function tarEntry(name: string, body: string): Uint8Array {
  const block = new Uint8Array(512 + Math.ceil(body.length / 512) * 512);
  const text = new TextEncoder();
  block.set(text.encode(name), 0);
  block.set(text.encode(body.length.toString(8).padStart(11, '0')), 124);
  block.set(text.encode('0'), 156);
  // The checksum field must read as spaces while the checksum is computed.
  block.fill(0x20, 148, 156);
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += block[i] as number;
  block.set(text.encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148);
  block.set(text.encode(body), 512);
  return block;
}

function bundleDir(manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kroma-serve-'));
  mkdirSync(dir, { recursive: true });
  const entry = tarEntry('module.json', JSON.stringify(manifest));
  const tar = new Uint8Array(entry.length + 1024);
  tar.set(entry, 0);
  // Uncompressed on purpose: the reader dispatches on magic bytes and takes a
  // raw tar, and the runner has no Bun compressor.
  writeFileSync(join(dir, `${manifest.id}.kmod`), tar);
  return dir;
}

const MANIFEST = {
  // The contract this build speaks, so a bump does not read as a broken test:
  // a bundle built for another one is deliberately skipped, which is what the
  // pinned-schema test below covers instead.
  schemaVersion: MODULE_SCHEMA_VERSION,
  id: 'com.acme.demo',
  name: 'Demo',
  version: '1.2.0',
  engines: { server: '>=0.1.0' },
  library: true,
};

describe('registryApp', () => {
  const app = registryApp(bundleDir(MANIFEST));
  const get = (path: string, origin = 'http://localhost:4173') =>
    app.fetch(new Request(`${origin}${path}`));

  it('serves the descriptor and the index off the bundles on disk', async () => {
    const descriptor = (await (await get('/registry.json')).json()) as { modules: string[] };
    expect(descriptor.modules).toEqual(['com.acme.demo']);
    const index = (await (await get('/index.json')).json()) as { id: string; version: string }[];
    expect(index[0]).toMatchObject({ id: 'com.acme.demo', version: '1.2.0' });
  });

  it('points artifacts at the origin the request arrived at', async () => {
    // Which is why there is no --base: the same tree is right on localhost, on a
    // LAN address and behind a tunnel.
    for (const origin of ['http://localhost:4173', 'http://192.168.1.50:8080']) {
      const index = (await (await get('/index.json', origin)).json()) as {
        artifacts: { url: string }[];
      }[];
      expect(index[0]?.artifacts[0]?.url).toBe(`${origin}/com.acme.demo.kmod`);
    }
  });

  it('serves one module record, and 404s one it does not carry', async () => {
    const record = (await (await get('/m/com.acme.demo.json')).json()) as { latest: string };
    expect(record.latest).toBe('1.2.0');
    expect((await get('/m/com.acme.nope.json')).status).toBe(404);
  });

  it('serves the schemas, versioned and aliased', async () => {
    const pinned = (await (await get('/schemas/2/manifest.json')).json()) as { $id: string };
    expect(pinned.$id).toBe('https://modules.kroma.tv/schemas/2/manifest.json');
    expect((await get('/schemas/manifest.json')).status).toBe(200);
    expect((await get('/schemas/nope.json')).status).toBe(404);
  });

  it('serves a bundle it listed, and nothing else', async () => {
    expect((await get('/com.acme.demo.kmod')).status).toBe(200);
    // Only a file the listing named, so a path cannot walk out of the directory.
    expect((await get('/../etc/passwd.kmod')).status).toBe(404);
    expect((await get('/other.kmod')).status).toBe(404);
  });
});
