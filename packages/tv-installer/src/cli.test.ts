import { runCommand } from 'citty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tv } from './cli';
import { docsCommand, doctorCommand, installCommand, scanCommand, toolsCommand } from './commands';
import { runTui } from './tui/app';

vi.mock('./commands', () => ({
  docsCommand: vi.fn(),
  doctorCommand: vi.fn(),
  installCommand: vi.fn(),
  scanCommand: vi.fn(),
  toolsCommand: vi.fn(),
}));
vi.mock('./exit-after', () => ({ exitAfter: vi.fn() }));
vi.mock('./tui/app', () => ({ runTui: vi.fn() }));

const argv = process.argv;
const isTTY = process.stdout.isTTY;

const run = (rawArgs: readonly string[]) => {
  process.argv = ['bun', 'tv', ...rawArgs];
  return runCommand(tv, { rawArgs: [...rawArgs] });
};

beforeEach(() => {
  process.stdout.isTTY = false;
});

afterEach(() => {
  process.argv = argv;
  process.stdout.isTTY = isTTY;
  vi.clearAllMocks();
});

describe('tv scan', () => {
  it('scans the network and prints what answered', async () => {
    await run(['scan']);

    expect(vi.mocked(scanCommand)).toHaveBeenCalledWith({
      hosts: undefined,
      json: false,
      launch: true,
    });
  });

  it('asks for machine output when the command line does', async () => {
    await run(['scan', '--json']);

    expect(vi.mocked(scanCommand).mock.calls[0]?.[0]?.json).toBe(true);
  });

  it('keeps every address the command line repeats, not only the last', async () => {
    await run(['scan', '--host', '192.168.1.31', '--host', '192.168.1.44']);

    expect(vi.mocked(scanCommand).mock.calls[0]?.[0]?.hosts).toEqual([
      '192.168.1.31',
      '192.168.1.44',
    ]);
  });

  it('reads an address spelled onto the flag with an equals sign', async () => {
    await run(['scan', '--host=192.168.1.31']);

    expect(vi.mocked(scanCommand).mock.calls[0]?.[0]?.hosts).toEqual(['192.168.1.31']);
  });

  it('sweeps the network when the flag was given no address at all', async () => {
    await run(['scan', '--host', '--json']);

    expect(vi.mocked(scanCommand).mock.calls[0]?.[0]?.hosts).toBeUndefined();
  });
});

describe('tv install', () => {
  it('installs onto the target it was given', async () => {
    await run(['install', '192.168.1.31']);

    expect(vi.mocked(installCommand)).toHaveBeenCalledWith('192.168.1.31', {
      hosts: undefined,
      artifact: undefined,
      source: undefined,
      moduleOptions: { native: false },
      launch: true,
      json: false,
    });
  });

  it('hands the package, the channel and the platform flags on', async () => {
    await run([
      'install',
      'all',
      '--package',
      '/out/KROMA.wgt',
      '--source',
      'canary',
      '--profile',
      'kroma',
      '--native',
      '--no-launch',
    ]);

    expect(vi.mocked(installCommand)).toHaveBeenCalledWith('all', {
      hosts: undefined,
      artifact: '/out/KROMA.wgt',
      source: 'canary',
      moduleOptions: { profile: 'kroma', native: true },
      launch: false,
      json: false,
    });
  });

  it('refuses a channel no release answers to', async () => {
    await expect(run(['install', 'all', '--source', 'ftp'])).rejects.toThrow(
      '--source takes local, stable, canary, build',
    );
  });
});

describe('tv tools', () => {
  it('installs the toolchain of every platform named', async () => {
    await run(['tools', 'tizen', 'webos']);

    expect(vi.mocked(toolsCommand)).toHaveBeenCalledWith(['tizen', 'webos']);
  });
});

describe('tv doctor', () => {
  it('reports what this computer already has', async () => {
    await run(['doctor']);

    expect(vi.mocked(doctorCommand)).toHaveBeenCalledOnce();
  });
});

describe('tv docs', () => {
  it('writes the command tree into the README', async () => {
    await run(['docs']);

    expect(vi.mocked(docsCommand)).toHaveBeenCalledWith(tv, false);
  });

  it('checks the README instead of writing it when asked to', async () => {
    await run(['docs', '--check']);

    expect(vi.mocked(docsCommand)).toHaveBeenCalledWith(tv, true);
  });
});

describe('tv', () => {
  it('opens the picker when it was started from a terminal', async () => {
    process.stdout.isTTY = true;

    await run(['--package', '/out/KROMA.wgt']);

    expect(vi.mocked(runTui)).toHaveBeenCalledWith({
      hosts: undefined,
      artifact: '/out/KROMA.wgt',
      source: undefined,
      launch: true,
    });
    expect(vi.mocked(scanCommand)).not.toHaveBeenCalled();
  });

  it('falls back to a scan where there is no terminal to draw a picker in', async () => {
    await run(['--json']);

    expect(vi.mocked(runTui)).not.toHaveBeenCalled();
    expect(vi.mocked(scanCommand)).toHaveBeenCalledWith({
      hosts: undefined,
      json: true,
      launch: true,
    });
  });
});
