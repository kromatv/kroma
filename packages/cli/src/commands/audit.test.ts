import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_SCHEMA_VERSION } from '@kromatv/registry';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ran = vi.hoisted(() => ({
  exec: vi.fn(),
  build: vi.fn(),
}));

vi.mock('../exec', () => ({ exec: ran.exec }));
vi.mock('../cargo', () => ({
  buildComponent: ran.build,
  targetDir: (cwd: string) => join(cwd, 'target', 'kmod'),
}));

import { auditCommand, auditHost } from './audit';

const work = mkdtempSync(join(tmpdir(), 'kroma-audit-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let made = 0;

function repository(ids: readonly string[]): string {
  made += 1;
  const root = join(work, `repo-${made}`);
  mkdirSync(join(root, 'server', 'crates', 'kroma-module-audit'), { recursive: true });
  mkdirSync(join(root, 'modules'), { recursive: true });
  writeFileSync(join(root, 'server', 'Cargo.toml'), '[package]\nversion = "0.1.39"\n');
  writeFileSync(join(root, 'server', 'crates', 'kroma-module-audit', 'Cargo.toml'), '');
  for (const id of ids) {
    const dir = join(root, 'modules', id);
    mkdirSync(dir, { recursive: true });
    const manifest = { schemaVersion: MODULE_SCHEMA_VERSION, id, name: id, version: '0.1.0' };
    writeFileSync(join(dir, 'module.json'), JSON.stringify(manifest));
  }
  return root;
}

beforeEach(() => {
  ran.exec.mockReset().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  ran.build
    .mockReset()
    .mockImplementation(async (project: { dir: string }) => join(project.dir, 'module.wasm'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('auditHost', () => {
  it('is the repository crate, built where the server workspace builds', () => {
    const root = repository([]);

    const host = auditHost(root, join(root, 'target', 'kmod'));

    expect(host).toEqual({
      manifest: join(root, 'server', 'crates', 'kroma-module-audit', 'Cargo.toml'),
      targetDir: null,
    });
  });
});

describe('auditCommand', () => {
  it('runs the audit host on each module with its directory and its component', async () => {
    const root = repository(['tv.acme.a', 'tv.acme.b']);

    const code = await auditCommand({ dirs: [], cwd: root });

    const asked = ran.exec.mock.calls.map(([command, args]) => [command, args.slice(-2)]);
    expect(code).toBe(0);
    expect(asked).toEqual([
      [
        'cargo',
        [join(root, 'modules', 'tv.acme.a'), join(root, 'modules', 'tv.acme.a', 'module.wasm')],
      ],
      [
        'cargo',
        [join(root, 'modules', 'tv.acme.b'), join(root, 'modules', 'tv.acme.b', 'module.wasm')],
      ],
    ]);
  });

  it('audits every module and then fails when one attempted something undeclared', async () => {
    const root = repository(['tv.acme.a', 'tv.acme.b']);
    ran.exec.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '' });

    const code = await auditCommand({ dirs: [], cwd: root });

    expect(code).toBe(1);
    expect(ran.exec).toHaveBeenCalledTimes(2);
  });

  it('passes a module with no component without running anything for it', async () => {
    const root = repository(['tv.acme.lib']);
    ran.build.mockResolvedValue(null);

    const code = await auditCommand({ dirs: [], cwd: root });

    expect(code).toBe(0);
    expect(ran.exec).not.toHaveBeenCalled();
  });

  it('asks for JSON when told to', async () => {
    const root = repository(['tv.acme.a']);

    await auditCommand({ dirs: [], cwd: root, json: true });

    expect(ran.exec.mock.calls[0]?.[1].at(-1)).toBe('--json');
  });
});
