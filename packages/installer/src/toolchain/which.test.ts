import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { which } from './which';

const base = mkdtempSync(join(tmpdir(), 'kroma-which-'));

function tool(directory: string, name: string, mode: number): string {
  mkdirSync(join(base, directory), { recursive: true });
  const path = join(base, directory, name);
  writeFileSync(path, '#!/bin/sh\n');
  chmodSync(path, mode);
  return path;
}

afterEach(() => vi.unstubAllEnvs());

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('which', () => {
  it('answers the first entry on PATH that holds the binary', () => {
    const first = tool('first', 'adb', 0o755);
    tool('second', 'adb', 0o755);

    vi.stubEnv('PATH', `${join(base, 'empty')}:${join(base, 'first')}:${join(base, 'second')}`);

    expect(which('adb')).toBe(first);
  });

  it('passes over a file that cannot be run', () => {
    tool('locked', 'sdb', 0o644);
    const runnable = tool('open', 'sdb', 0o755);

    vi.stubEnv('PATH', `${join(base, 'locked')}:${join(base, 'open')}`);

    expect(which('sdb')).toBe(runnable);
  });

  it('passes over a directory named like the binary', () => {
    mkdirSync(join(base, 'folder', 'ares-install'), { recursive: true });

    vi.stubEnv('PATH', join(base, 'folder'));

    expect(which('ares-install')).toBeNull();
  });

  it('never reads an empty PATH entry as the working directory', () => {
    vi.stubEnv('PATH', ':');

    expect(which('package.json')).toBeNull();
  });

  it('answers nothing when there is no PATH to search', () => {
    vi.stubEnv('PATH', undefined);

    expect(which('adb')).toBeNull();
  });
});
