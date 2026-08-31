import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadGraph } from './load';

const ROOT = mkdtempSync(join(tmpdir(), 'kroma-graph-'));

function write(rel: string, body: string | object): void {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body));
}

write('server/Cargo.toml', '[package]\nname = "kroma-server"\nversion = "0.1.38"\n');
write('packages/ui/package.json', { name: '@kroma/ui', version: '1.2.0' });
write('packages/core/package.json', {
  name: '@kroma/core',
  version: '1.0.0',
  dependencies: { '@kroma/ui': 'workspace:*', zod: '^4' },
  devDependencies: { vitest: '^4' },
});
write('packages/broken/package.json', '{ not json');
write('packages/unnamed/package.json', { version: '1.0.0' });
write('modules/tv.kroma.vpn/module.json', {
  id: 'tv.kroma.vpn',
  version: '0.4.1',
  dependencies: { 'tv.kroma.torrents': '^0.1.0' },
  engines: { server: '>=0.1.4' },
});
write('modules/tv.kroma.remote/module.json', { id: 'tv.kroma.remote', engines: [] });
write('modules/not-a-module/module.json', { version: '9.9.9' });

const graph = loadGraph({ root: ROOT });

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('reading a repo into a graph', () => {
  it('reads the server version out of its Cargo manifest', () => {
    expect(graph.server).toMatchObject({ name: 'server', dir: 'server', version: '0.1.38' });
  });

  it('leaves the server out when the tree has no Rust manifest', () => {
    expect(loadGraph({ root: ROOT, serverManifest: 'nope/Cargo.toml' }).server).toBeUndefined();
  });

  it('falls back to 0.0.0 for a Cargo manifest that states no version', () => {
    write('other/Cargo.toml', '[package]\nname = "x"\n');

    expect(loadGraph({ root: ROOT, serverManifest: 'other/Cargo.toml' }).server?.version).toBe(
      '0.0.0',
    );
  });
});

describe('the JS workspace projects', () => {
  const named = (name: string) => graph.projects.find((p) => p.name === name);

  it('keeps only the dependencies that name another project in this graph', () => {
    expect(named('@kroma/core')?.deps).toEqual(['@kroma/ui']);
  });

  it('skips a package.json that does not parse rather than failing the load', () => {
    expect(graph.projects.map((p) => p.dir)).not.toContain('packages/broken');
  });

  it('skips a package.json with no name, which nothing could depend on', () => {
    expect(graph.projects.map((p) => p.dir)).not.toContain('packages/unnamed');
  });

  it('reads nothing from a workspace root that is not there', () => {
    expect(loadGraph({ root: ROOT, workspaceRoots: ['nowhere'] }).projects).toHaveLength(3);
  });
});

describe('the module projects', () => {
  const named = (name: string) => graph.projects.find((p) => p.name === name);

  it('keeps the declared ranges beside the resolved dependency names', () => {
    expect(named('tv.kroma.vpn')).toMatchObject({
      version: '0.4.1',
      deps: ['tv.kroma.torrents'],
      ranges: { 'tv.kroma.torrents': '^0.1.0' },
      serverRange: '>=0.1.4',
    });
  });

  it('falls back to 0.0.0 and no dependencies for a bare manifest', () => {
    expect(named('tv.kroma.remote')).toMatchObject({ version: '0.0.0', deps: [] });
  });

  it('ignores an engines block that is not a table of ranges', () => {
    expect(named('tv.kroma.remote')?.serverRange).toBeUndefined();
  });

  it('skips a module.json with no id', () => {
    expect(graph.projects.map((p) => p.dir)).not.toContain('modules/not-a-module');
  });
});
