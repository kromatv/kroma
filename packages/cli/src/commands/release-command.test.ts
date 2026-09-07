import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../bundle/catalog';
import { packBundle } from '../bundle/pack';
import type { Plan } from './release';
import { releaseCommand } from './release';

const REPO = 'maxscharwath/kroma';

let dir: string;

function pack(id: string, version: string, icon?: string): void {
  const project = join(dir, 'modules', id);
  mkdirSync(project, { recursive: true });
  const manifest = { schemaVersion: 2, id, name: id, version, library: true };
  writeFileSync(join(project, 'module.json'), JSON.stringify(manifest));
  if (icon) writeFileSync(join(project, 'icon.svg'), icon);
  packBundle({
    project: { dir: project, manifest, server: null, ui: null },
    binPath: null,
    feDir: null,
    outDir: join(dir, 'dist', 'modules'),
    target: null,
  });
}

function stubCatalog(published: Catalog | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (published ? Response.json(published) : new Response('', { status: 404 }))),
  );
}

function written<T>(file: string): T {
  return JSON.parse(readFileSync(join(dir, 'dist', 'registry', file), 'utf8')) as T;
}

async function firstRelease(id: string, version: string): Promise<Catalog> {
  pack(id, version);
  stubCatalog(null);
  await releaseCommand({ repo: REPO, cwd: dir });
  return written<Catalog>('modules.json');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kroma-release-'));
  vi.stubEnv('GITHUB_REPOSITORY', '');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('releaseCommand', () => {
  it('refuses to run without a repository to cut the tags in', async () => {
    await expect(releaseCommand({ cwd: dir })).rejects.toThrow(/--repo owner\/name is required/);
  });

  it('takes the repository off the environment when no flag names one', async () => {
    pack('tv.acme.notes', '0.1.0');
    stubCatalog(null);
    vi.stubEnv('GITHUB_REPOSITORY', 'acme/store');

    const code = await releaseCommand({ cwd: dir });

    expect(code).toBe(0);
    expect(written<Catalog>('modules.json').modules[0]?.artifacts[0]?.url).toContain(
      'github.com/acme/store/releases/download/tv.acme.notes@0.1.0/',
    );
  });

  it('treats a catalog that is not published yet as a first release', async () => {
    pack('tv.acme.notes', '0.1.0');
    stubCatalog(null);

    const code = await releaseCommand({ repo: REPO, cwd: dir });

    expect(code).toBe(0);
    expect(written<Plan>('plan.json').publish).toMatchObject([
      { id: 'tv.acme.notes', tag: 'tv.acme.notes@0.1.0', reason: 'new' },
    ]);
  });

  it('writes nothing on a dry run', async () => {
    pack('tv.acme.notes', '0.1.0');
    stubCatalog(null);

    const code = await releaseCommand({ repo: REPO, cwd: dir, dryRun: true });

    expect(code).toBe(0);
    expect(existsSync(join(dir, 'dist', 'registry', 'modules.json'))).toBe(false);
  });

  it('publishes a bumped module against what is already live', async () => {
    const live = await firstRelease('tv.acme.notes', '0.1.0');
    pack('tv.acme.notes', '0.2.0');
    stubCatalog(live);

    const code = await releaseCommand({ repo: REPO, cwd: dir });

    expect(code).toBe(0);
    expect(written<Plan>('plan.json')).toMatchObject({
      publish: [{ version: '0.2.0', reason: 'publish' }],
      unchanged: [],
    });
  });

  it('leaves an unchanged module out of the publish plan', async () => {
    const live = await firstRelease('tv.acme.notes', '0.1.0');
    stubCatalog(live);

    const code = await releaseCommand({ repo: REPO, cwd: dir });

    expect(code).toBe(0);
    expect(written<Plan>('plan.json')).toMatchObject({ publish: [], unchanged: ['tv.acme.notes'] });
  });

  it('warns about bytes that moved without a bump, and still answers 0', async () => {
    const live = await firstRelease('tv.acme.notes', '0.1.0');
    pack('tv.acme.notes', '0.1.0', '<svg id="redrawn"/>');
    stubCatalog(live);

    const code = await releaseCommand({ repo: REPO, cwd: dir });

    expect(code).toBe(0);
    expect(written<Plan>('plan.json').publish).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('tv.acme.notes'));
  });

  it('answers 1 under --strict when bytes moved without a bump', async () => {
    const live = await firstRelease('tv.acme.notes', '0.1.0');
    pack('tv.acme.notes', '0.1.0', '<svg id="redrawn"/>');
    stubCatalog(live);

    const code = await releaseCommand({ repo: REPO, cwd: dir, strict: true });

    expect(code).toBe(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('--strict'));
  });

  it('answers 1 and writes nothing when a version went backwards', async () => {
    const live = await firstRelease('tv.acme.notes', '0.1.0');
    const ahead = live.modules[0];
    if (!ahead) throw new Error('the first release wrote no module');
    ahead.version = '0.9.0';
    rmSync(join(dir, 'dist', 'registry'), { recursive: true, force: true });
    stubCatalog(live);

    const code = await releaseCommand({ repo: REPO, cwd: dir });

    expect(code).toBe(1);
    expect(existsSync(join(dir, 'dist', 'registry', 'modules.json'))).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('cannot be released'));
  });

  it('refuses a published catalog the network would not hand over', async () => {
    pack('tv.acme.notes', '0.1.0');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    );

    await expect(releaseCommand({ repo: REPO, cwd: dir })).rejects.toThrow(/HTTP 503/);
  });

  it('reads the published catalog off disk when it is named as a path', async () => {
    const live = await firstRelease('tv.acme.notes', '0.1.0');
    const path = join(dir, 'live.json');
    writeFileSync(path, JSON.stringify(live));
    stubCatalog(null);

    const code = await releaseCommand({ repo: REPO, cwd: dir, published: path });

    expect(code).toBe(0);
    expect(written<Plan>('plan.json').unchanged).toEqual(['tv.acme.notes']);
  });

  it('refuses a published catalog path with nothing at it', async () => {
    pack('tv.acme.notes', '0.1.0');

    await expect(
      releaseCommand({ repo: REPO, cwd: dir, published: join(dir, 'absent.json') }),
    ).rejects.toThrow(/does not exist/);
  });
});
