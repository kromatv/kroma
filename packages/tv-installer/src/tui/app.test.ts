import { cancel, outro } from '@clack/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleOptions } from '../modules/module';
import { television } from '../television.fixture';
import { runTui } from './app';
import { askModules, chooseSource } from './choose';
import { discover } from './discover';
import { installSets } from './install-sets';

vi.mock('@clack/prompts', async (real) => ({
  ...(await real<typeof import('@clack/prompts')>()),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('./choose', () => ({ askModules: vi.fn(), chooseSource: vi.fn() }));
vi.mock('./discover', () => ({ discover: vi.fn() }));
vi.mock('./install-sets', () => ({ installSets: vi.fn() }));

const salon = television();
const cuisine = television({ host: '192.168.1.11', name: 'Cuisine' });
const passphrases: Map<string, ModuleOptions> = new Map([['192.168.1.11', { passphrase: 'AB' }]]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(discover).mockResolvedValue([salon]);
  vi.mocked(chooseSource).mockResolvedValue('stable');
  vi.mocked(askModules).mockResolvedValue(passphrases);
  vi.mocked(installSets).mockResolvedValue([]);
});

describe('runTui', () => {
  it('installs onto every ticked set and answers 0', async () => {
    const code = await runTui({ hosts: ['192.168.1.10'], launch: true });

    expect(discover).toHaveBeenCalledWith(['192.168.1.10']);
    expect(installSets).toHaveBeenCalledWith([salon], {
      artifact: undefined,
      source: 'stable',
      launch: true,
      moduleOptions: passphrases,
    });
    expect(code).toBe(0);
  });

  it('counts the sets that took KROMA and answers 1 when one did not', async () => {
    vi.mocked(discover).mockResolvedValue([salon, cuisine]);
    vi.mocked(installSets).mockResolvedValue([cuisine]);

    const code = await runTui({ launch: true });

    expect(outro).toHaveBeenCalledWith('1 of 2 sets took KROMA, 1 failed');
    expect(code).toBe(1);
  });

  it('names the one set it put KROMA on', async () => {
    const code = await runTui({ launch: true });

    expect(outro).toHaveBeenCalledWith('KROMA is on 1 set');
    expect(code).toBe(0);
  });

  it('stops with nothing to install onto when no set was ticked', async () => {
    vi.mocked(discover).mockResolvedValue([]);

    const code = await runTui({ launch: true });

    expect(outro).toHaveBeenCalledWith('nothing to install onto');
    expect(installSets).not.toHaveBeenCalled();
    expect(code).toBe(1);
  });

  it('answers 130 when the search itself was quit', async () => {
    vi.mocked(discover).mockResolvedValue(null);

    const code = await runTui({ launch: true });

    expect(cancel).toHaveBeenCalledWith('nothing was installed');
    expect(chooseSource).not.toHaveBeenCalled();
    expect(code).toBe(130);
  });

  it('answers 130 when the package choice was cancelled', async () => {
    vi.mocked(chooseSource).mockResolvedValue(null);

    const code = await runTui({ launch: true });

    expect(askModules).not.toHaveBeenCalled();
    expect(code).toBe(130);
  });

  it('answers 130 when a module was still asking something', async () => {
    vi.mocked(askModules).mockResolvedValue(null);

    const code = await runTui({ launch: true });

    expect(installSets).not.toHaveBeenCalled();
    expect(code).toBe(130);
  });

  it('asks nothing about the package when a flag already named the source', async () => {
    await runTui({ source: 'canary', launch: false });

    expect(chooseSource).not.toHaveBeenCalled();
    expect(installSets).toHaveBeenCalledWith(
      [salon],
      expect.objectContaining({ source: 'canary' }),
    );
  });

  it('asks nothing about the package when a flag already named the file', async () => {
    await runTui({ artifact: '/out/KROMA.wgt', launch: true });

    expect(chooseSource).not.toHaveBeenCalled();
    expect(installSets).toHaveBeenCalledWith(
      [salon],
      expect.objectContaining({ artifact: '/out/KROMA.wgt', source: undefined }),
    );
  });
});
