import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_SCHEMA_VERSION } from '@kromatv/registry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cargo', async (importActual) => ({
  ...(await importActual<typeof import('../cargo')>()),
  cargo: vi.fn(),
}));

import { cargo } from '../cargo';
import { checkCommand } from './check';

let dir = '';

function moduleAt(name: string, id: string, entry?: string): void {
  const at = join(dir, 'modules', name);
  mkdirSync(at, { recursive: true });
  writeFileSync(
    join(at, 'module.json'),
    JSON.stringify({ schemaVersion: MODULE_SCHEMA_VERSION, id, name: id, version: '0.1.0' }),
  );
  if (entry === undefined) return;
  mkdirSync(join(at, 'ui', 'src'), { recursive: true });
  writeFileSync(join(at, 'ui', 'src', 'module.tsx'), entry);
}

function crateAt(name: string, cargoToml: string): void {
  mkdirSync(join(dir, 'modules', name, 'server'), { recursive: true });
  writeFileSync(join(dir, 'modules', name, 'server', 'Cargo.toml'), cargoToml);
}

function modules(): string {
  dir = mkdtempSync(join(tmpdir(), 'kroma-check-'));
  return dir;
}

function said(): string {
  const lines = vi.mocked(console.error).mock.calls.flat();
  return lines.join('\n');
}

beforeEach(() => {
  vi.mocked(cargo).mockReset();
  vi.stubEnv('KMOD_TARGET_DIR', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('checkCommand', () => {
  it('passes a set of modules whose manifests are valid and distinct', async () => {
    modules();
    moduleAt('notes', 'tv.acme.notes');
    moduleAt('lists', 'tv.acme.lists');

    const code = await checkCommand({ dirs: [], rust: false, ts: false, cwd: dir });

    expect(code).toBe(0);
  });

  it('refuses a module that needs a server past the one this tree prepares', async () => {
    modules();
    mkdirSync(join(dir, 'server'), { recursive: true });
    writeFileSync(join(dir, 'server', 'Cargo.toml'), '[package]\nversion = "0.1.39"\n');
    moduleAt('notes', 'tv.acme.notes');
    writeFileSync(
      join(dir, 'modules', 'notes', 'module.json'),
      JSON.stringify({
        schemaVersion: MODULE_SCHEMA_VERSION,
        id: 'tv.acme.notes',
        name: 'Notes',
        version: '0.1.0',
        engines: { server: '>=0.1.40' },
      }),
    );

    const code = await checkCommand({ dirs: [], rust: false, ts: false, cwd: dir });

    expect(code).toBe(1);
    expect(said()).toContain('tv.acme.notes: needs server 0.1.40, past 0.1.39');
  });

  it('names both directories when two modules claim the same id', async () => {
    modules();
    moduleAt('notes', 'tv.acme.notes');
    moduleAt('notes-fork', 'tv.acme.notes');

    const code = await checkCommand({ dirs: [], rust: false, ts: false, cwd: dir });

    expect(code).toBe(1);
    expect(said()).toContain('duplicate module id "tv.acme.notes"');
    expect(said()).toContain('notes-fork');
  });

  it('reads the catalogs beside a module that declares notification types', async () => {
    modules();
    moduleAt('notes', 'tv.acme.notes');
    const at = join(dir, 'modules', 'notes');
    writeFileSync(
      join(at, 'module.json'),
      JSON.stringify({
        schemaVersion: MODULE_SCHEMA_VERSION,
        id: 'tv.acme.notes',
        name: 'Notes',
        version: '0.1.0',
        notifications: [
          { type: 'tv.acme.notes/note.shared', category: 'media', titleKey: 't', bodyKey: 'b' },
        ],
      }),
    );
    mkdirSync(join(at, 'locales'));
    writeFileSync(join(at, 'locales', 'en.json'), JSON.stringify({ t: 'Shared' }));

    const code = await checkCommand({ dirs: [], rust: false, ts: false, cwd: dir });

    expect(code).toBe(1);
    expect(said()).toContain('names "b", which locales/en.json lacks');
  });

  it('lints the crate here and its component for wasm32-wasip2, with the features the build enables', async () => {
    modules();
    moduleAt('notes', 'tv.acme.notes');
    crateAt(
      'notes',
      '[package]\nname = "kroma-notes"\n\n[package.metadata.kmod]\nfeatures = ["local"]\n\n[[bin]]\nname = "module"\n',
    );
    vi.mocked(cargo).mockResolvedValue(0);

    const code = await checkCommand({ dirs: [], ts: false, cwd: dir });

    expect(code).toBe(0);
    expect(vi.mocked(cargo).mock.calls.map(([, args]) => args)).toEqual([
      ['clippy', '--all-targets', '--', '-D', 'warnings'],
      [
        'clippy',
        '--bin',
        'module',
        '--features',
        'local',
        '--target',
        'wasm32-wasip2',
        '--',
        '-D',
        'warnings',
      ],
    ]);
  });

  it('names the module whose component does not build for wasm32-wasip2', async () => {
    modules();
    moduleAt('notes', 'tv.acme.notes');
    crateAt('notes', '[package]\nname = "kroma-notes"\n\n[[bin]]\nname = "module"\n');
    vi.mocked(cargo).mockImplementation(async (_cwd, args) =>
      args.includes('--target') ? 101 : 0,
    );

    const code = await checkCommand({ dirs: [], ts: false, cwd: dir });

    expect(code).toBe(1);
    expect(said()).toContain('tv.acme.notes: clippy failed for wasm32-wasip2');
    expect(said()).toContain('1 problem(s)');
  });

  it('lints a library crate here only, since it builds no component', async () => {
    modules();
    moduleAt('scene', 'tv.acme.scene');
    crateAt('scene', '[package]\nname = "kroma-scene"\n');
    vi.mocked(cargo).mockResolvedValue(0);

    await checkCommand({ dirs: [], ts: false, cwd: dir });

    expect(vi.mocked(cargo).mock.calls.map(([, args]) => args)).toEqual([
      ['clippy', '--all-targets', '--', '-D', 'warnings'],
    ]);
  });

  it('reports a frontend with no tsconfig beside it, and its imports all the same', async () => {
    modules();
    moduleAt('notes', 'tv.acme.notes', "import { Button } from '#ui/atoms/button';\n");

    const code = await checkCommand({ dirs: [], rust: false, cwd: dir });

    expect(code).toBe(1);
    expect(said()).toContain('no tsconfig.json beside the frontend');
    expect(said()).toContain("is the kit's private alias");
  });
});
