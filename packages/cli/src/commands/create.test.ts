import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CreateOptions, createCommand } from './create';

let dir = '';

function plain(): string {
  dir = mkdtempSync(join(tmpdir(), 'kroma-create-'));
  return dir;
}

function repo(): string {
  dir = mkdtempSync(join(tmpdir(), 'kroma-create-repo-'));
  mkdirSync(join(dir, 'server'), { recursive: true });
  mkdirSync(join(dir, 'modules'), { recursive: true });
  writeFileSync(
    join(dir, 'server', 'Cargo.toml'),
    '[package]\nname = "kroma-server"\nversion = "1.2.3"\n',
  );
  writeFileSync(join(dir, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.99.0"\n');
  writeFileSync(join(dir, 'package.json'), '{ "name": "kroma" }\n');
  return dir;
}

function create(cwd: string, over: CreateOptions = {}): Promise<number> {
  return createCommand({ id: 'tv.acme.notes', yes: true, install: false, cwd, ...over });
}

function tree(at: string): string[] {
  return readdirSync(at, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(at.length + 1))
    .sort();
}

function json(at: string, rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(at, rel), 'utf8'));
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('createCommand outside a checkout', () => {
  it('writes a page, a sidecar and everything that packs them', async () => {
    const cwd = plain();

    await create(cwd);

    expect(tree(join(cwd, 'tv.acme.notes'))).toEqual([
      '.cargo/config.toml',
      '.gitignore',
      'README.md',
      'icon.svg',
      'locales/en.json',
      'locales/fr.json',
      'module.json',
      'package.json',
      'rust-toolchain.toml',
      'server/Cargo.toml',
      'server/src/bin/module.rs',
      'server/src/lib.rs',
      'tsconfig.json',
      'ui/src/NotesPage.tsx',
      'ui/src/module.tsx',
      'ui/src/schemas.ts',
    ]);
  });

  it('leaves out the page for a sidecar, and everything npm for it too', async () => {
    const cwd = plain();

    await create(cwd, { kind: 'server' });

    const files = tree(join(cwd, 'tv.acme.notes'));
    expect(files).not.toContain('package.json');
    expect(files).not.toContain('tsconfig.json');
    expect(files.filter((f) => f.startsWith('ui/'))).toEqual([]);
    expect(files).toContain('server/src/lib.rs');
  });

  it('leaves out the crate for a page', async () => {
    const cwd = plain();

    await create(cwd, { kind: 'ui' });

    const files = tree(join(cwd, 'tv.acme.notes'));
    expect(files.filter((f) => f.startsWith('server/'))).toEqual([]);
    expect(files).toContain('ui/src/NotesPage.tsx');
  });

  it('names the module in a manifest the schema of the day accepts', async () => {
    const cwd = plain();

    await create(cwd, { name: 'Notes', description: 'Jot things down' });

    expect(json(join(cwd, 'tv.acme.notes'), 'module.json')).toMatchObject({
      id: 'tv.acme.notes',
      name: 'Notes',
      description: 'Jot things down',
      version: '0.1.0',
      feRemote: { module: './remoteEntry.js' },
    });
  });

  it('depends on the published SDK and extends its tsconfig', async () => {
    const cwd = plain();

    await create(cwd);

    const at = join(cwd, 'tv.acme.notes');
    expect(json(at, 'package.json')).toMatchObject({
      name: 'tv.acme.notes',
      dependencies: { '@kromatv/sdk': expect.any(String) },
      scripts: { dev: 'kroma dev', build: 'kroma build' },
    });
    expect(json(at, 'tsconfig.json')).toMatchObject({ extends: '@kromatv/sdk/tsconfig' });
  });

  it('refuses to write over a directory that already holds something', async () => {
    const cwd = plain();
    mkdirSync(join(cwd, 'tv.acme.notes'), { recursive: true });
    writeFileSync(join(cwd, 'tv.acme.notes', 'README.md'), 'mine\n');

    await expect(create(cwd)).rejects.toThrow(/exists and is not empty/);
  });

  it('refuses to answer for itself when it was given no id', async () => {
    const cwd = plain();

    await expect(createCommand({ yes: true, install: false, cwd })).rejects.toThrow(
      /--yes needs an id/,
    );
  });
});

describe('createCommand inside a checkout', () => {
  it('lands under modules/ with workspace links and no toolchain of its own', async () => {
    const cwd = repo();

    await create(cwd);

    const at = join(cwd, 'modules', 'tv.acme.notes');
    const files = tree(at);
    expect(files).not.toContain('rust-toolchain.toml');
    expect(files).not.toContain('.cargo/config.toml');
    expect(files).not.toContain('.gitignore');
    expect(json(at, 'package.json')).toMatchObject({
      name: '@kromatv/module-notes',
      dependencies: { '@kromatv/module-sdk': 'workspace:*', '@kromatv/ui': 'workspace:*' },
    });
    expect(json(at, 'tsconfig.json')).toMatchObject({ extends: '../../tsconfig.base.json' });
  });
});
