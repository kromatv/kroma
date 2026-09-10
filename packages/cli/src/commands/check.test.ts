import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_SCHEMA_VERSION } from '@kromatv/registry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCommand, importProblems, specifierOf, unsatisfiableRanges } from './check';

const PROJECT = '/modules/tv.acme.notes';
const FILE = join(PROJECT, 'ui/src/page.tsx');

const problems = (line: string) => importProblems(FILE, `${line}\n`, PROJECT);

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

function modules(): string {
  dir = mkdtempSync(join(tmpdir(), 'kroma-check-'));
  return dir;
}

function said(): string {
  const lines = vi.mocked(console.error).mock.calls.flat();
  return lines.join('\n');
}

beforeEach(() => {
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

describe('specifierOf', () => {
  it('reads the specifier off an import, whichever quote it uses', () => {
    expect(specifierOf("import { Button } from '@kromatv/ui/kit';")).toBe('@kromatv/ui/kit');
    expect(specifierOf('import { Button } from "@kromatv/ui/kit";')).toBe('@kromatv/ui/kit');
  });

  it('reads it off a re-export and off a side-effect import', () => {
    expect(specifierOf("export { Button } from './button';")).toBe('./button');
    expect(specifierOf("import './styles.css';")).toBe('./styles.css');
  });

  it('is null for an import spread over several lines, which has no quote yet', () => {
    expect(specifierOf('import {')).toBeNull();
  });

  it('is null for a line that imports nothing', () => {
    expect(specifierOf('const a = 1;')).toBeNull();
  });

  it('does not read a quoted word as a specifier because the line starts with export', () => {
    expect(specifierOf("export const label = 'from';")).toBeNull();
  });
});

describe('importProblems', () => {
  it('names the kit’s private alias and the import that replaces it', () => {
    expect(problems("import { Button } from '#ui/components/atoms/button';")).toEqual([
      "ui/src/page.tsx: '#ui/components/atoms/button' is the kit's private alias; import from '@kromatv/ui/kit'",
    ]);
  });

  it('names a relative path that walks out of the module', () => {
    expect(problems("import { shared } from '../../../other/shared';")).toEqual([
      "ui/src/page.tsx: '../../../other/shared' reaches outside the module",
    ]);
  });

  it('leaves an import that stays inside, and a package the host provides', () => {
    expect(problems("import { schemas } from './schemas';")).toEqual([]);
    expect(problems("import { Button } from '@kromatv/ui/kit';")).toEqual([]);
  });
});

describe('checkCommand', () => {
  it('passes a set of modules whose manifests are valid and distinct', async () => {
    modules();
    moduleAt('notes', 'tv.acme.notes');
    moduleAt('lists', 'tv.acme.lists');

    const code = await checkCommand({ dirs: [], rust: false, ts: false, cwd: dir });

    expect(code).toBe(0);
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

  it('reports a frontend with no tsconfig beside it, and its imports all the same', async () => {
    modules();
    moduleAt('notes', 'tv.acme.notes', "import { Button } from '#ui/atoms/button';\n");

    const code = await checkCommand({ dirs: [], rust: false, cwd: dir });

    expect(code).toBe(1);
    expect(said()).toContain('no tsconfig.json beside the frontend');
    expect(said()).toContain("is the kit's private alias");
  });
});

describe('unsatisfiableRanges', () => {
  const project = (id: string, version: string, dependencies?: Record<string, string>) =>
    ({ dir: id, manifest: { id, version, dependencies }, server: null, ui: null }) as never;

  it('names a peer that has moved past a declared range', () => {
    const tree = [
      project('tv.kroma.torrents', '0.6.6'),
      project('tv.kroma.acquisition', '0.3.9', { 'tv.kroma.torrents': '^0.3.0' }),
    ];

    expect(unsatisfiableRanges(tree)).toEqual([
      'tv.kroma.acquisition: needs tv.kroma.torrents@^0.3.0 but this tree has 0.6.6',
    ]);
  });

  it('accepts a floor the peer clears', () => {
    const tree = [
      project('tv.kroma.torrents', '0.6.6'),
      project('tv.kroma.acquisition', '0.3.9', { 'tv.kroma.torrents': '>=0.3.0' }),
    ];

    expect(unsatisfiableRanges(tree)).toEqual([]);
  });

  it('says nothing about a dependency that lives outside this tree', () => {
    const tree = [project('tv.kroma.acquisition', '0.3.9', { 'com.someone.else': '^1.0.0' })];

    expect(unsatisfiableRanges(tree)).toEqual([]);
  });
});
