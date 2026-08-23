import { homedir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KROMA_TOOLS } from '../../toolchain/detect';
import { ARES, aresSibling } from './tools';

const runOk = vi.hoisted(() =>
  vi.fn(async (_command: readonly string[], _options?: unknown) => ''),
);
vi.mock('../../run', () => ({ runOk }));

beforeEach(() => {
  runOk.mockReset();
});

describe('ARES', () => {
  it('looks for the CLI where a global bun install and a package manager put it', () => {
    expect(ARES.candidates?.()).toEqual([
      join(homedir(), '.bun', 'bin', 'ares-install'),
      join(KROMA_TOOLS, 'node_modules', '.bin', 'ares-install'),
      '/usr/local/bin/ares-install',
      '/opt/homebrew/bin/ares-install',
    ]);
  });

  it('installs the CLI globally with bun', async () => {
    await ARES.install?.(() => {});

    expect(runOk.mock.calls[0]?.[0]).toEqual(['bun', 'add', '-g', '@webos-tools/cli']);
  });
});

describe('aresSibling', () => {
  it('names a command beside the one that was found', () => {
    expect(aresSibling('/opt/homebrew/bin/ares-install', 'ares-launch')).toBe(
      '/opt/homebrew/bin/ares-launch',
    );
  });
});
