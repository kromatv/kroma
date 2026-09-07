import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cargo', async (importActual) => ({
  ...(await importActual<typeof import('../cargo')>()),
  cargo: vi.fn(),
}));

import { cargo } from '../cargo';
import { cargoCommand } from './cargo';

let dir: string;

const ran = () => vi.mocked(cargo).mock.calls;

function moduleCrate(id: string, withServer = true): string {
  const project = join(dir, 'modules', id);
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, 'module.json'),
    JSON.stringify({ schemaVersion: 2, id, name: id, version: '0.1.0' }),
  );
  if (withServer) {
    mkdirSync(join(project, 'server'), { recursive: true });
    writeFileSync(
      join(project, 'server', 'Cargo.toml'),
      `[package]\nname = "kroma-${id.split('.').pop()}"\n\n[[bin]]\nname = "module"\n`,
    );
  }
  return join(project, 'server');
}

function libCrate(): string {
  const lib = join(dir, 'modules', 'lib');
  mkdirSync(lib, { recursive: true });
  writeFileSync(join(lib, 'Cargo.toml'), '[package]\nname = "kroma-naming"\n');
  return lib;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kroma-cargo-cmd-'));
  vi.mocked(cargo).mockReset();
  vi.mocked(cargo).mockResolvedValue(0);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('cargoCommand', () => {
  it('refuses to run with no subcommand to pass on', async () => {
    await expect(cargoCommand([], dir)).rejects.toThrow(/usage: kroma cargo/);
  });

  it('runs the subcommand in every module server crate in id order, under one target directory', async () => {
    const b = moduleCrate('tv.acme.b');
    const a = moduleCrate('tv.acme.a');

    const code = await cargoCommand(['clippy', '--all-targets'], dir);

    expect(code).toBe(0);
    expect(ran()).toEqual([
      [a, ['clippy', '--all-targets'], join(dir, 'target/kmod')],
      [b, ['clippy', '--all-targets'], join(dir, 'target/kmod')],
    ]);
  });

  it('reaches modules/lib last, which is a crate and not a module', async () => {
    const a = moduleCrate('tv.acme.a');
    const lib = libCrate();

    await cargoCommand(['test'], dir);

    expect(ran().map((call) => call[0])).toEqual([a, lib]);
  });

  it('leaves out a module that ships no server crate', async () => {
    const a = moduleCrate('tv.acme.a');
    moduleCrate('tv.acme.frontend-only', false);

    await cargoCommand(['test'], dir);

    expect(ran().map((call) => call[0])).toEqual([a]);
  });

  it('names every module the subcommand failed in and answers 1', async () => {
    moduleCrate('tv.acme.a');
    moduleCrate('tv.acme.b');
    moduleCrate('tv.acme.c');
    vi.mocked(cargo).mockResolvedValueOnce(0).mockResolvedValueOnce(101).mockResolvedValueOnce(101);

    const code = await cargoCommand(['clippy'], dir);

    expect(code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('failed in 2 module(s): tv.acme.b, tv.acme.c'),
    );
  });

  it('says every module passed and answers 0', async () => {
    moduleCrate('tv.acme.a');

    const code = await cargoCommand(['test'], dir);

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('every module passed'));
  });
});
