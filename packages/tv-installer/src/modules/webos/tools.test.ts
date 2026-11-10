import { homedir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KROMA_TOOLS } from '../../toolchain/detect';
import { ARES, aresSibling } from './tools';

const { runOk, which, mkdir } = vi.hoisted(() => ({
  runOk: vi.fn(async (_command: readonly string[], _options?: unknown) => ''),
  which: vi.fn((_binary: string): string | null => null),
  mkdir: vi.fn(async (_path: string, _options?: unknown) => undefined),
}));
vi.mock('../../run', () => ({ runOk }));
vi.mock('../../toolchain/which', () => ({ which }));
vi.mock('node:fs/promises', () => ({ mkdir }));

beforeEach(() => {
  runOk.mockReset();
  which.mockReset();
  mkdir.mockClear();
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

  it('installs the CLI globally with bun on a machine that has bun', async () => {
    which.mockReturnValue('/Users/tester/.bun/bin/bun');

    await ARES.install?.(() => {});

    expect(runOk.mock.calls[0]?.[0]).toEqual(['bun', 'add', '-g', '@webos-tools/cli']);
    expect(mkdir).not.toHaveBeenCalled();
  });

  it('installs the CLI with npm, beside the other tools, where there is no bun', async () => {
    await ARES.install?.(() => {});

    expect(mkdir).toHaveBeenCalledWith(KROMA_TOOLS, { recursive: true });
    expect(runOk.mock.calls[0]?.[0]).toEqual([
      'npm',
      'install',
      '--prefix',
      KROMA_TOOLS,
      '--no-audit',
      '--no-fund',
      '@webos-tools/cli',
    ]);
  });
});

describe('aresSibling', () => {
  it('names a command beside the one that was found', () => {
    expect(aresSibling('/opt/homebrew/bin/ares-install', 'ares-launch')).toBe(
      '/opt/homebrew/bin/ares-launch',
    );
  });
});
