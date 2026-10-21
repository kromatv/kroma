import { describe, expect, it, vi } from 'vitest';
import type { PackageFiles } from './content-hash';
import { packageName, publishTarball, type Registry } from './publish';

const enc = new TextEncoder();
const FILES = new Map<string, PackageFiles>();

function pkg(version: string, js = 'a'): PackageFiles {
  return new Map([
    ['package.json', enc.encode(JSON.stringify({ name: '@k/p', version }))],
    ['index.js', enc.encode(js)],
  ]);
}

function setup(published: PackageFiles | null) {
  FILES.set('local', pkg('2'));
  const registry: Registry = {
    publishedTarball: vi.fn(async () => (published ? enc.encode('published') : null)),
    publish: vi.fn(async () => {}),
  };
  FILES.set('published', published ?? pkg('0'));
  const deps = {
    registry,
    load: async () => enc.encode('local'),
    read: (bytes: Uint8Array) => FILES.get(new TextDecoder().decode(bytes)) as PackageFiles,
  };
  return { registry, deps };
}

const request = { tarball: 'p.tgz', tag: 'canary', provenance: true, dryRun: false };

describe('packageName', () => {
  it('reads the name from package.json', () => {
    expect(packageName(pkg('1'))).toBe('@k/p');
  });

  it('refuses a tarball without one', () => {
    expect(() => packageName(new Map())).toThrow(/no package.json/);
  });
});

describe('publishTarball', () => {
  it('skips a canary identical to the published one', async () => {
    const { registry, deps } = setup(pkg('1'));

    const out = await publishTarball(request, deps);

    expect(out).toMatchObject({ publish: false, name: '@k/p' });
    expect(registry.publish).not.toHaveBeenCalled();
  });

  it('publishes a canary that differs', async () => {
    const { registry, deps } = setup(pkg('1', 'b'));

    await publishTarball(request, deps);

    expect(registry.publish).toHaveBeenCalledWith('p.tgz', request);
  });

  it('publishes a first canary', async () => {
    const { registry, deps } = setup(null);

    await publishTarball(request, deps);

    expect(registry.publish).toHaveBeenCalledOnce();
  });

  it('publishes latest without asking the registry', async () => {
    const { registry, deps } = setup(pkg('1'));

    await publishTarball({ ...request, tag: 'latest' }, deps);

    expect(registry.publishedTarball).not.toHaveBeenCalled();
    expect(registry.publish).toHaveBeenCalledOnce();
  });
});
