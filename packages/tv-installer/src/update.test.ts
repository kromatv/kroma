import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RememberedSet } from './remembered';
import type { Television } from './television';
import { updateCommand } from './update';

const { rememberedSets, scan, deployTo, askForLocalNetwork, resolve } = vi.hoisted(() => ({
  rememberedSets: vi.fn(async (): Promise<unknown[]> => []),
  scan: vi.fn(async (_options: unknown): Promise<unknown[]> => []),
  deployTo: vi.fn(async (_tv: unknown, _options: unknown) => {}),
  askForLocalNetwork: vi.fn(async () => {}),
  resolve: vi.fn(async (_request: unknown) => '/downloads/KROMA-tizen-0.1.39.wgt'),
}));
vi.mock('./remembered', () => ({ rememberedSets }));
vi.mock('./discovery/scan', () => ({ scan }));
vi.mock('./install/deploy', () => ({ deployTo }));
vi.mock('./local-network', () => ({ askForLocalNetwork }));
vi.mock('./modules/registry', () => ({ moduleFor: () => ({ resolve }) }));

const remembered: RememberedSet = {
  host: '192.168.1.31',
  platform: 'tizen',
  name: 'Salon',
  model: 'UE50AU7172',
  package: 'KROMA-tizen-0.1.38.wgt',
  source: 'stable',
  installedAt: '2026-11-10T12:00:00.000Z',
};

const salon: Television = {
  host: '192.168.1.31',
  platform: 'tizen',
  vendor: 'Samsung',
  name: 'Salon',
  model: 'UE50AU7172',
  developerMode: 'on',
  sideloadable: true,
  note: '',
  runtime: null,
};

const printed: string[] = [];
const failed: string[] = [];
const options = { launch: false, force: false };

beforeEach(() => {
  printed.length = 0;
  failed.length = 0;
  vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  vi.spyOn(console, 'error').mockImplementation((line: string) => void failed.push(line));
  rememberedSets.mockResolvedValue([remembered]);
  scan.mockResolvedValue([salon]);
  resolve.mockResolvedValue('/downloads/KROMA-tizen-0.1.39.wgt');
  deployTo.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('updateCommand', () => {
  it('puts the newest package on a set that has an older one', async () => {
    const code = await updateCommand(options);

    expect(code).toBe(0);
    expect(deployTo.mock.calls[0]).toEqual([
      salon,
      expect.objectContaining({
        artifact: '/downloads/KROMA-tizen-0.1.39.wgt',
        source: 'stable',
        launch: false,
      }),
    ]);
    expect(printed.join('\n')).toContain('updated to KROMA-tizen-0.1.39.wgt');
  });

  it('looks only at the addresses it remembers', async () => {
    await updateCommand(options);

    expect(scan).toHaveBeenCalledWith({ hosts: ['192.168.1.31'] });
  });

  it('leaves a set alone when it already has the newest package', async () => {
    resolve.mockResolvedValue('/downloads/KROMA-tizen-0.1.38.wgt');

    const code = await updateCommand(options);

    expect(code).toBe(0);
    expect(deployTo).not.toHaveBeenCalled();
    expect(printed.join('\n')).toContain('already has KROMA-tizen-0.1.38.wgt');
  });

  it('installs the same package again when forced to', async () => {
    resolve.mockResolvedValue('/downloads/KROMA-tizen-0.1.38.wgt');

    await updateCommand({ ...options, force: true });

    expect(deployTo).toHaveBeenCalledOnce();
  });

  it('follows the channel a set was installed from', async () => {
    rememberedSets.mockResolvedValue([{ ...remembered, source: 'canary' }]);

    await updateCommand(options);

    expect(resolve.mock.calls[0]?.[0]).toMatchObject({ source: 'canary' });
  });

  it('takes the stable channel for a set that remembers none', async () => {
    rememberedSets.mockResolvedValue([{ ...remembered, source: undefined }]);

    await updateCommand(options);

    expect(resolve.mock.calls[0]?.[0]).toMatchObject({ source: 'stable' });
  });

  it('follows the channel that was named over the remembered one', async () => {
    await updateCommand({ ...options, source: 'canary', moduleOptions: { profile: 'KROMA' } });

    expect(resolve.mock.calls[0]?.[0]).toMatchObject({ source: 'canary' });
    expect(deployTo.mock.calls[0]?.[1]).toMatchObject({ moduleOptions: { profile: 'KROMA' } });
  });

  it('repeats the options the install was given', async () => {
    rememberedSets.mockResolvedValue([{ ...remembered, options: { profile: 'KROMA' } }]);

    await updateCommand({ ...options, moduleOptions: { native: true } });

    expect(deployTo.mock.calls[0]?.[1]).toMatchObject({
      moduleOptions: { profile: 'KROMA', native: true },
    });
  });

  it('takes an option that is named over the remembered one', async () => {
    rememberedSets.mockResolvedValue([{ ...remembered, options: { profile: 'KROMA' } }]);

    await updateCommand({ ...options, moduleOptions: { profile: 'salon' } });

    expect(deployTo.mock.calls[0]?.[1]).toMatchObject({ moduleOptions: { profile: 'salon' } });
  });

  it('says so about a set that no longer answers at its address, and goes on', async () => {
    const chambre = { ...remembered, host: '192.168.1.44', name: 'Chambre' };
    rememberedSets.mockResolvedValue([chambre, remembered]);

    const code = await updateCommand(options);

    expect(code).toBe(1);
    expect(failed[0]).toContain('no set answers at 192.168.1.44: turn it on');
    expect(deployTo).toHaveBeenCalledOnce();
  });

  it('does not take another kind of set that answers at the address', async () => {
    scan.mockResolvedValue([{ ...salon, platform: 'webos' }]);

    expect(await updateCommand(options)).toBe(1);
    expect(deployTo).not.toHaveBeenCalled();
  });

  it('names a set by its model when it has no name', async () => {
    rememberedSets.mockResolvedValue([{ ...remembered, name: '' }]);

    await updateCommand(options);

    expect(printed[0]).toContain('UE50AU7172 (192.168.1.31)');
  });

  it('quotes a failure that is not an error object', async () => {
    deployTo.mockRejectedValue('the set went away');

    expect(await updateCommand(options)).toBe(1);
    expect(failed[0]).toContain('the set went away');
  });

  it('says there is nothing to update before any install', async () => {
    rememberedSets.mockResolvedValue([]);

    const code = await updateCommand(options);

    expect(code).toBe(1);
    expect(printed).toEqual(['no television is remembered yet: install KROMA on one first']);
    expect(scan).not.toHaveBeenCalled();
  });
});
