import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { docsCommand, doctorCommand, installCommand, scanCommand, toolsCommand } from './commands';
import type { DeployOptions } from './install/deploy';
import type { Television } from './television';
import type { Tool } from './toolchain/detect';
import { injectUsage, renderUsage, type UsageCommand } from './usage';

const { checkout, scan, deployTo, askForLocalNetwork, diagnoseEmptyScan, locate, installTool } =
  await vi.hoisted(async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    return {
      checkout: mkdtempSync(join(tmpdir(), 'kroma-tv-commands-')),
      scan: vi.fn(async (_options: unknown): Promise<unknown[]> => []),
      deployTo: vi.fn(async (_tv: unknown, _options: unknown) => {}),
      askForLocalNetwork: vi.fn(async () => {}),
      diagnoseEmptyScan: vi.fn(async () => ({
        blocked: false,
        hints: ['a set answers when it is on'],
      })),
      locate: vi.fn((_tool: unknown): string | null => null),
      installTool: vi.fn(async (_tool: unknown, _log: unknown) => '/usr/bin/adb'),
    };
  });
vi.mock('./discovery/scan', () => ({ scan }));
vi.mock('./install/deploy', () => ({ deployTo }));
vi.mock('./local-network', () => ({ askForLocalNetwork }));
vi.mock('./hints', () => ({ diagnoseEmptyScan }));
vi.mock('./root', () => ({ root: checkout }));
vi.mock('./toolchain/detect', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  locate,
}));
vi.mock('./toolchain/install', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  installTool,
}));

const readme = join(checkout, 'packages', 'tv-installer', 'README.md');
vi.stubGlobal('Bun', {
  file: (path: string) => ({ text: async () => readFileSync(path, 'utf8') }),
  write: async (path: string, content: string) => writeFileSync(path, content),
});

const salon: Television = {
  host: '192.168.1.31',
  platform: 'tizen',
  vendor: 'Samsung',
  name: '[TV] Salon',
  model: 'UE50AU7172',
  developerMode: 'on',
  sideloadable: true,
  note: 'developer mode off',
  runtime: null,
};

const cuisine: Television = {
  ...salon,
  host: '192.168.1.42',
  platform: 'webos',
  vendor: 'LG',
  name: 'Cuisine',
  model: 'OLED55C16LA',
  developerMode: 'off',
  runtime: {
    name: 'webOS',
    version: '6.0',
    engine: { name: 'Chromium', version: '79' },
    learned: 'reported',
  },
};

const printed: string[] = [];
const failed: string[] = [];

beforeEach(() => {
  printed.length = 0;
  failed.length = 0;
  vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  vi.spyOn(console, 'error').mockImplementation((line: string) => void failed.push(line));
  scan.mockReset();
  deployTo.mockReset();
  locate.mockReset();
  installTool.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  rmSync(checkout, { recursive: true, force: true });
});

const options = { launch: true, json: false } as const;

describe('scanCommand', () => {
  it('prints the address, the package and the name of every set that answered', async () => {
    scan.mockResolvedValue([salon, cuisine]);

    const code = await scanCommand(options);

    expect(code).toBe(0);
    expect(printed[0]).toContain('192.168.1.31');
    expect(printed[0]).toContain('Samsung .wgt');
    expect(printed[0]).toContain('[TV] Salon');
  });

  it('prints what a set runs under its own line', async () => {
    scan.mockResolvedValue([cuisine]);

    await scanCommand(options);

    expect(printed[0]).toContain('\n');
    expect(printed[0]).toContain('webOS 6.0, Chromium 79');
  });

  it('cuts a name too long for its column rather than pushing the row over', async () => {
    scan.mockResolvedValue([{ ...salon, name: 'The Television In The Living Room' }]);

    await scanCommand(options);

    expect(printed[0]).toContain('The Television In The Li… ');
  });

  it('falls back to the model of a set that carries no name', async () => {
    scan.mockResolvedValue([{ ...salon, name: '' }]);

    await scanCommand(options);

    expect(printed[0]).toContain('UE50AU7172');
  });

  it('prints the sets as JSON when asked, and nothing else', async () => {
    scan.mockResolvedValue([salon]);

    const code = await scanCommand({ ...options, json: true });

    expect(code).toBe(0);
    expect(JSON.parse(printed.join(''))).toEqual([salon]);
  });

  it('explains an empty scan and answers a failure', async () => {
    const code = await scanCommand(options);

    expect(code).toBe(1);
    expect(printed).toEqual([
      'no television answered on this network',
      'a set answers when it is on',
    ]);
  });

  it('asks macOS for the local network before it probes anything', async () => {
    await scanCommand(options);

    expect(askForLocalNetwork).toHaveBeenCalled();
  });
});

describe('installCommand', () => {
  it('installs on every set that answered when the target is all', async () => {
    scan.mockResolvedValue([salon, cuisine]);

    const code = await installCommand('all', options);

    expect(code).toBe(0);
    expect(deployTo).toHaveBeenCalledTimes(2);
  });

  it('probes only the address it was given, and installs on that set alone', async () => {
    scan.mockResolvedValue([salon, cuisine]);

    await installCommand('192.168.1.42', options);

    expect(scan).toHaveBeenCalledWith({ hosts: ['192.168.1.42'] });
    expect(deployTo).toHaveBeenCalledOnce();
    expect(deployTo.mock.calls[0]?.[0]).toBe(cuisine);
  });

  it('hands the package, the source and the module flags down to the install', async () => {
    scan.mockResolvedValue([salon]);

    await installCommand('all', {
      ...options,
      artifact: '/out/KROMA.wgt',
      source: 'canary',
      moduleOptions: { profile: 'LUMA' },
      launch: false,
    });

    expect(deployTo.mock.calls[0]?.[1]).toMatchObject({
      artifact: '/out/KROMA.wgt',
      source: 'canary',
      moduleOptions: { profile: 'LUMA' },
      launch: false,
    });
  });

  it('refuses an address no television answered at', async () => {
    scan.mockResolvedValue([salon]);

    const code = await installCommand('192.168.1.99', options);

    expect(code).toBe(1);
    expect(failed[0]).toBe('192.168.1.99 is not a television this tool can install onto');
  });

  it('says nothing answered when a sweep for every set came back empty', async () => {
    const code = await installCommand('all', options);

    expect(code).toBe(1);
    expect(failed[0]).toBe('no television to install onto');
  });

  it('passes over a set whose platform takes no sideloaded app, and says why', async () => {
    scan.mockResolvedValue([{ ...salon, sideloadable: false, note: 'SAPHI: takes no app' }]);

    const code = await installCommand('all', options);

    expect(code).toBe(1);
    expect(failed[0]).toContain('SAPHI: takes no app');
    expect(deployTo).not.toHaveBeenCalled();
  });

  it('answers a failure when a set refused the install', async () => {
    scan.mockResolvedValue([salon]);
    deployTo.mockRejectedValue(new Error('the TV refused the connection'));

    const code = await installCommand('all', options);

    expect(code).toBe(1);
    expect(failed[0]).toContain('the TV refused the connection');
  });

  it('keeps going to the next set after one refused the install', async () => {
    scan.mockResolvedValue([salon, cuisine]);
    deployTo.mockRejectedValueOnce(new Error('the TV refused the connection'));

    const code = await installCommand('all', options);

    expect(code).toBe(1);
    expect(printed.join('\n')).toContain('installed on Cuisine');
  });

  it('indents what the install says under the set it is talking to', async () => {
    scan.mockResolvedValue([salon]);
    deployTo.mockImplementation(async (_tv, given) => {
      (given as DeployOptions).log('pushing KROMA.wgt, 40%');
    });

    await installCommand('all', options);

    expect(printed).toContain('  pushing KROMA.wgt, 40%');
  });

  it('quotes whatever a module threw that was not an error', async () => {
    scan.mockResolvedValue([salon]);
    deployTo.mockRejectedValue('sdb died');

    await installCommand('all', options);

    expect(failed[0]).toContain('sdb died');
  });
});

const tizenCli = (path: string | null) => (tool: unknown) =>
  (tool as Tool).id === 'tizen' ? path : null;

describe('doctorCommand', () => {
  it('lists every platform this tool installs onto', async () => {
    doctorCommand();

    expect(printed.join('\n')).toContain('Samsung  .wgt');
    expect(printed.join('\n')).toContain('Apple TV  .app');
  });

  it('shows where a toolchain this machine already has lives', async () => {
    locate.mockImplementation(tizenCli('/home/tizen-studio/tools/ide/bin/tizen'));

    doctorCommand();

    expect(printed.join('\n')).toContain(
      'Tizen Studio CLI      /home/tizen-studio/tools/ide/bin/tizen',
    );
  });

  it('says where a missing toolchain comes from', async () => {
    doctorCommand();

    expect(printed.join('\n')).toContain(
      'Android Debug Bridge  missing, from dl.google.com platform-tools',
    );
  });
});

describe('toolsCommand', () => {
  it('installs every tool the named platform needs', async () => {
    const code = await toolsCommand(['tizen']);

    expect(code).toBe(0);
    expect(installTool.mock.calls.map(([tool]) => (tool as Tool).id)).toEqual(['tizen', 'sdb']);
  });

  it('installs the tools of each platform that was named', async () => {
    await toolsCommand(['webos', 'androidtv']);

    expect(installTool.mock.calls.map(([tool]) => (tool as Tool).id)).toEqual(['ares', 'adb']);
  });

  it('says so about a platform that needs nothing this tool can install', async () => {
    const code = await toolsCommand(['appletv']);

    expect(code).toBe(0);
    expect(printed.join('\n')).toContain('Apple TV needs nothing this tool can install');
    expect(installTool).not.toHaveBeenCalled();
  });

  it('refuses a platform no module answers for, and names the ones that do', async () => {
    const code = await toolsCommand(['sony']);

    expect(code).toBe(1);
    expect(failed).toEqual(['usage: tools <tizen|webos|androidtv|appletv>']);
    expect(installTool).not.toHaveBeenCalled();
  });
});

const tv: UsageCommand = {
  meta: { name: 'tv', description: 'find televisions and install KROMA' },
  args: { json: { type: 'boolean', description: 'machine readable output' } },
  subCommands: { scan: { meta: { description: 'list what answered' } } },
};

const TEMPLATE = '# tv\n\n<!-- usage:start -->\n\n<!-- usage:end -->\n\ntail\n';

describe('docsCommand', () => {
  beforeEach(() => {
    mkdirSync(join(checkout, 'packages', 'tv-installer'), { recursive: true });
    writeFileSync(readme, TEMPLATE);
  });

  it('writes the command tree into the README', async () => {
    const code = await docsCommand(tv, false);

    expect(code).toBe(0);
    expect(readFileSync(readme, 'utf8')).toContain('| `bun run tv scan` | list what answered |');
  });

  it('leaves a README that already carries the current tree alone', async () => {
    writeFileSync(readme, injectUsage(TEMPLATE, await renderUsage(tv, 'bun run tv')));

    const code = await docsCommand(tv, true);

    expect(code).toBe(0);
    expect(printed).toEqual(['packages/tv-installer/README.md is current']);
  });

  it('fails a stale README under a check instead of rewriting it', async () => {
    const code = await docsCommand(tv, true);

    expect(code).toBe(1);
    expect(failed).toEqual(['packages/tv-installer/README.md is out of date: run bun run tv docs']);
    expect(readFileSync(readme, 'utf8')).toBe(TEMPLATE);
  });
});
