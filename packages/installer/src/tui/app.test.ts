import { cancel, outro } from '@clack/prompts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformOptions } from '../platforms/platform';
import { television } from '../shared/television.fixture';
import { runTui } from './app';
import { showBanner } from './banner';
import { askPlatforms, chooseKinds, chooseVersion } from './choose';
import { discover } from './discover';
import { installSets } from './install-sets';
import { showSetup } from './setup';

vi.mock('@clack/prompts', async (real) => ({
  ...(await real<typeof import('@clack/prompts')>()),
  outro: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('./banner', () => ({ showBanner: vi.fn() }));
vi.mock('./choose', () => ({
  askPlatforms: vi.fn(),
  chooseKinds: vi.fn(),
  chooseVersion: vi.fn(),
}));
vi.mock('./discover', () => ({ discover: vi.fn() }));
vi.mock('./install-sets', () => ({ installSets: vi.fn() }));
vi.mock('./setup', () => ({ showSetup: vi.fn() }));

const salon = television();
const cuisine = television({ host: '192.168.1.11', name: 'Cuisine' });
const passphrases: Map<string, PlatformOptions> = new Map([['192.168.1.11', { passphrase: 'AB' }]]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chooseVersion).mockResolvedValue('stable');
  vi.mocked(chooseKinds).mockResolvedValue(['tizen']);
  vi.mocked(discover).mockResolvedValue([salon]);
  vi.mocked(askPlatforms).mockResolvedValue(passphrases);
  vi.mocked(installSets).mockResolvedValue([]);
});

describe('runTui', () => {
  it('asks the version, then the kind of TV, shows its steps, and looks for that kind', async () => {
    const code = await runTui({ launch: true, version: '0.1.40' });

    expect(showBanner).toHaveBeenCalledWith('0.1.40');
    expect(chooseKinds).toHaveBeenCalledWith('stable');
    expect(showSetup).toHaveBeenCalledWith(['tizen']);
    expect(discover).toHaveBeenCalledWith(undefined, ['tizen']);
    expect(installSets).toHaveBeenCalledWith([salon], {
      artifact: undefined,
      source: 'stable',
      launch: true,
      platformOptions: passphrases,
    });
    expect(code).toBe(0);
  });

  it('asks no kind and shows no steps when addresses were given', async () => {
    await runTui({ hosts: ['192.168.1.10'], launch: true });

    expect(chooseKinds).not.toHaveBeenCalled();
    expect(showSetup).not.toHaveBeenCalled();
    expect(discover).toHaveBeenCalledWith(['192.168.1.10'], undefined);
  });

  it('counts the TVs that took KROMA and answers 1 when one did not', async () => {
    vi.mocked(discover).mockResolvedValue([salon, cuisine]);
    vi.mocked(installSets).mockResolvedValue([cuisine]);

    const code = await runTui({ launch: true });

    expect(outro).toHaveBeenCalledWith('1 of 2 TVs took KROMA, 1 failed');
    expect(code).toBe(1);
  });

  it('names the one TV it put KROMA on', async () => {
    await runTui({ launch: true });

    expect(outro).toHaveBeenCalledWith('KROMA is on 1 TV');
  });

  it('stops with nothing to install onto when no TV was ticked', async () => {
    vi.mocked(discover).mockResolvedValue([]);

    const code = await runTui({ launch: true });

    expect(outro).toHaveBeenCalledWith('nothing to install onto');
    expect(installSets).not.toHaveBeenCalled();
    expect(code).toBe(1);
  });

  it('answers 130 and looks for nothing when the version choice was quit', async () => {
    vi.mocked(chooseVersion).mockResolvedValue(null);

    const code = await runTui({ launch: true });

    expect(cancel).toHaveBeenCalledWith('nothing was installed');
    expect(chooseKinds).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
    expect(code).toBe(130);
  });

  it('answers 130 and looks for nothing when the kind choice was quit', async () => {
    vi.mocked(chooseKinds).mockResolvedValue(null);

    const code = await runTui({ launch: true });

    expect(discover).not.toHaveBeenCalled();
    expect(code).toBe(130);
  });

  it('answers 130 when the search itself was quit', async () => {
    vi.mocked(discover).mockResolvedValue(null);

    expect(await runTui({ launch: true })).toBe(130);
  });

  it('answers 130 when a module was still asking something', async () => {
    vi.mocked(askPlatforms).mockResolvedValue(null);

    const code = await runTui({ launch: true });

    expect(installSets).not.toHaveBeenCalled();
    expect(code).toBe(130);
  });

  it('asks no version when a flag already named the source, and offers the kinds that take it', async () => {
    await runTui({ source: 'canary', launch: false });

    expect(chooseVersion).not.toHaveBeenCalled();
    expect(chooseKinds).toHaveBeenCalledWith('canary');
    expect(installSets).toHaveBeenCalledWith(
      [salon],
      expect.objectContaining({ source: 'canary' }),
    );
  });

  it('asks no version when a flag already named the file', async () => {
    await runTui({ artifact: '/out/KROMA.wgt', launch: true });

    expect(chooseVersion).not.toHaveBeenCalled();
    expect(chooseKinds).toHaveBeenCalledWith(undefined);
    expect(installSets).toHaveBeenCalledWith(
      [salon],
      expect.objectContaining({ artifact: '/out/KROMA.wgt', source: undefined }),
    );
  });
});
