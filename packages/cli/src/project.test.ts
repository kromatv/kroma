import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findProjects, isDirectory, isModuleSet, moduleDirs, openProject } from './project';

const work = mkdtempSync(join(tmpdir(), 'kroma-project-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const MANIFEST = { schemaVersion: 2, id: 'tv.kroma.notes', name: 'Notes', version: '1.2.0' };
const MANIFEST_JSON = JSON.stringify(MANIFEST);

const CARGO = [
  '[package]',
  'name = "kroma-notes"',
  '',
  '[package.metadata.kmod]',
  'features = ["local", "gpu"]',
  '',
  '[[bin]]',
  'name = "module"',
].join('\n');

let made = 0;

function tree(files: Record<string, string>): string {
  made += 1;
  const dir = join(work, `tree-${made}`);
  mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  return dir;
}

describe('openProject', () => {
  it('refuses a directory that holds no module.json', () => {
    expect(() => openProject(tree({}))).toThrow(/is not a module/);
  });

  it('refuses a module.json that is not JSON', () => {
    expect(() => openProject(tree({ 'module.json': '{ "id": ' }))).toThrow(/invalid JSON/);
  });

  it('refuses a manifest carrying a field the schema does not declare', () => {
    const dir = tree({ 'module.json': JSON.stringify({ ...MANIFEST, dependsOn: {} }) });

    expect(() => openProject(dir)).toThrow(/dependsOn/);
  });

  it('names the field a manifest got wrong', () => {
    const dir = tree({ 'module.json': JSON.stringify({ ...MANIFEST, version: 1 }) });

    expect(() => openProject(dir)).toThrow(/version: /);
  });

  it('refuses an id that is not reverse-DNS', () => {
    const dir = tree({ 'module.json': JSON.stringify({ ...MANIFEST, id: 'Notes' }) });

    expect(() => openProject(dir)).toThrow(/reverse-DNS/);
  });

  it('refuses a manifest written against another schema version', () => {
    const dir = tree({ 'module.json': JSON.stringify({ ...MANIFEST, schemaVersion: 1 }) });

    expect(() => openProject(dir)).toThrow(/schemaVersion must be/);
  });

  it('reads a module that is a manifest and nothing else', () => {
    const dir = tree({ 'module.json': MANIFEST_JSON });

    const project = openProject(dir);

    expect(project).toEqual({ dir, manifest: MANIFEST, server: null, ui: null });
  });

  it('reads the crate name, its binary and the features the kmod build enables', () => {
    const dir = tree({ 'module.json': MANIFEST_JSON, 'server/Cargo.toml': CARGO });

    const project = openProject(dir);

    expect(project.server).toEqual({
      dir: join(dir, 'server'),
      crate: 'kroma-notes',
      bin: 'module',
      features: ['local', 'gpu'],
    });
  });

  it('reads a library crate, which declares no binary and no features', () => {
    const cargo = '[package]\nname = "kroma-notes"\n';
    const dir = tree({ 'module.json': MANIFEST_JSON, 'server/Cargo.toml': cargo });

    const project = openProject(dir);

    expect(project.server).toMatchObject({ bin: null, features: [] });
  });

  it('finds the frontend entry however the module spells it', () => {
    const entries = [
      'ui/src/module.tsx',
      'ui/src/module.ts',
      'ui/src/index.tsx',
      'ui/src/index.ts',
    ];

    const found = entries.map((entry) =>
      openProject(tree({ 'module.json': MANIFEST_JSON, [entry]: 'export default {};' })),
    );

    expect(found.map((p) => p.ui?.entry.slice(p.dir.length + 1))).toEqual(entries);
  });

  it('takes module.tsx over an index file beside it', () => {
    const dir = tree({
      'module.json': MANIFEST_JSON,
      'ui/src/module.tsx': 'export default {};',
      'ui/src/index.ts': 'export default {};',
    });

    const project = openProject(dir);

    expect(project.ui).toEqual({ dir: join(dir, 'ui'), entry: join(dir, 'ui/src/module.tsx') });
  });
});

describe('moduleDirs', () => {
  it('lists the modules under a root, sorted, and skips what is not one', () => {
    const root = tree({
      'tv.kroma.vpn/module.json': MANIFEST_JSON,
      'tv.kroma.notes/module.json': MANIFEST_JSON,
      'lib/README.md': 'shared code, not a module',
      'roster.yaml': '',
    });

    expect(moduleDirs(root)).toEqual([join(root, 'tv.kroma.notes'), join(root, 'tv.kroma.vpn')]);
  });

  it('is empty for a root that is not there', () => {
    expect(moduleDirs(join(work, 'no-such-modules'))).toEqual([]);
  });
});

describe('findProjects', () => {
  it('opens the directories it was given, absolute or relative to the cwd', () => {
    const relative = tree({ 'module.json': MANIFEST_JSON });
    const absolute = tree({ 'module.json': MANIFEST_JSON });

    const found = findProjects([basename(relative), absolute], work);

    expect(found.map((p) => p.dir)).toEqual([relative, absolute]);
  });

  it('opens the module the cwd is', () => {
    const dir = tree({ 'module.json': MANIFEST_JSON });

    const found = findProjects([], dir);

    expect(found.map((p) => p.manifest.id)).toEqual(['tv.kroma.notes']);
  });

  it('opens every module under modules/ when the cwd holds them', () => {
    const cwd = tree({
      'modules/tv.kroma.vpn/module.json': MANIFEST_JSON,
      'modules/tv.kroma.notes/module.json': MANIFEST_JSON,
    });

    const found = findProjects([], cwd);

    expect(found.map((p) => p.dir)).toEqual([
      join(cwd, 'modules/tv.kroma.notes'),
      join(cwd, 'modules/tv.kroma.vpn'),
    ]);
  });

  it('refuses a cwd that is neither a module nor a directory of them', () => {
    expect(() => findProjects([], tree({}))).toThrow(/no module here/);
  });
});

describe('isModuleSet', () => {
  it('is true for a directory of modules and false for one module', () => {
    const set = tree({ 'modules/tv.kroma.notes/module.json': MANIFEST_JSON });
    const one = tree({ 'module.json': MANIFEST_JSON });

    expect(isModuleSet(set)).toBe(true);
    expect(isModuleSet(one)).toBe(false);
  });
});

describe('isDirectory', () => {
  it('is true for a directory, and false for a file or a path with nothing at it', () => {
    const dir = tree({ 'module.json': MANIFEST_JSON });

    expect(isDirectory(dir)).toBe(true);
    expect(isDirectory(join(dir, 'module.json'))).toBe(false);
    expect(isDirectory(join(dir, 'nothing'))).toBe(false);
  });
});
