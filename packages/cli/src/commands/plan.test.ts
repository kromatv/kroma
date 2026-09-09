import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULE_SCHEMA_VERSION } from '@kromatv/registry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planCommand } from './plan';

let dir = '';

function module(id: string, cargo: string): void {
  const at = join(dir, 'modules', id);
  mkdirSync(join(at, 'server'), { recursive: true });
  writeFileSync(
    join(at, 'module.json'),
    JSON.stringify({ schemaVersion: MODULE_SCHEMA_VERSION, id, name: id, version: '0.1.0' }),
  );
  writeFileSync(join(at, 'server', 'Cargo.toml'), cargo);
}

function modules(): string {
  dir = mkdtempSync(join(tmpdir(), 'kroma-plan-cmd-'));
  module('tv.acme.lib', '[package]\nname = "kroma-module-lib"\n');
  module(
    'tv.acme.notes',
    '[package]\nname = "kroma-module-notes"\n\n[package.metadata.kmod]\nfeatures = ["local"]\n\n[[bin]]\nname = "module"\n',
  );
  return dir;
}

function planned(target?: string): string[] {
  const written: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  planCommand([], target, modules());
  return written.join('').trimEnd().split('\n');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('planCommand', () => {
  it('points every build at one target directory, relative to wherever the tree is mounted', () => {
    vi.stubEnv('KMOD_TARGET_DIR', '');
    vi.stubEnv('KMOD_TARGET', '');

    expect(planned()[0]).toBe('export CARGO_TARGET_DIR="$PWD/target/kmod"');
  });

  it('emits one cargo line per sidecar and none for a library module', () => {
    vi.stubEnv('KMOD_TARGET_DIR', '');
    vi.stubEnv('KMOD_TARGET', '');

    expect(planned().slice(1)).toEqual([
      'cargo build --bin module --profile release-kmod --features local --manifest-path modules/tv.acme.notes/server/Cargo.toml',
    ]);
  });

  it('cross-compiles when a triple is given', () => {
    vi.stubEnv('KMOD_TARGET_DIR', '');
    vi.stubEnv('KMOD_TARGET', '');

    expect(planned('x86_64-unknown-linux-musl')[1]).toContain('--target x86_64-unknown-linux-musl');
  });
});
