import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '../platforms/platform';
import type { Television } from '../shared/television';
import { deployTo } from './deploy';

const { platformFor, rememberSet, rememberedSets } = vi.hoisted(() => ({
  platformFor: vi.fn((_platform: string): unknown => undefined),
  rememberSet: vi.fn(async (_set: unknown) => {}),
  rememberedSets: vi.fn(async (): Promise<unknown[]> => []),
}));
vi.mock('../platforms/registry', () => ({ platformFor }));
vi.mock('./remembered', () => ({ rememberSet, rememberedSets }));

const shield: Television = {
  host: '192.168.1.36',
  platform: 'androidtv',
  vendor: 'Nvidia',
  name: 'Shield',
  model: 'SHIELD Android TV',
  developerMode: 'on',
  sideloadable: true,
  note: 'network debugging open on 5555',
  runtime: null,
};

const steps: string[] = [];
const resolve = vi.fn(async () => '/out/KROMA.apk');
const install = vi.fn(async (_context: unknown) => {});

const androidtv: Platform = {
  id: 'androidtv',
  label: 'Android TV',
  brands: 'Philips, Sony, TCL, Shield, Chromecast',
  package: '.apk',
  notReadyHint: 'network debugging off',
  sources: () => [],
  resolve,
  install,
};

const log = () => {};

const remembered = (fields: Record<string, unknown>) => ({
  host: shield.host,
  platform: shield.platform,
  name: shield.name,
  model: shield.model,
  package: 'KROMA.apk',
  installedAt: '2026-11-10T12:00:00.000Z',
  ...fields,
});

beforeEach(() => {
  steps.length = 0;
  resolve.mockClear();
  install.mockClear();
  rememberSet.mockReset();
  rememberSet.mockResolvedValue(undefined);
  rememberedSets.mockResolvedValue([]);
  resolve.mockImplementation(async () => {
    steps.push('resolve');
    return '/out/KROMA.apk';
  });
  install.mockImplementation(async () => void steps.push('install'));
  platformFor.mockReturnValue(androidtv);
});

describe('deployTo', () => {
  it('resolves the package before it installs it', async () => {
    await deployTo(shield, { log });

    expect(steps).toEqual(['resolve', 'install']);
  });

  it('hands the module the package it resolved, and starts the app', async () => {
    await deployTo(shield, { log });

    expect(install).toHaveBeenCalledWith({
      tv: shield,
      artifact: '/out/KROMA.apk',
      log,
      launch: true,
      options: {},
    });
  });

  it('passes the package that was named and where it should come from', async () => {
    await deployTo(shield, { log, artifact: '/out/other.apk', source: 'canary' });

    expect(resolve).toHaveBeenCalledWith({
      tv: shield,
      given: '/out/other.apk',
      source: 'canary',
      log,
    });
  });

  it('remembers the set and the package it put on it', async () => {
    await deployTo(shield, { log, source: 'canary' });

    expect(rememberSet.mock.calls[0]?.[0]).toMatchObject({
      host: '192.168.1.36',
      platform: 'androidtv',
      name: 'Shield',
      model: 'SHIELD Android TV',
      package: 'KROMA.apk',
      source: 'canary',
    });
  });

  it('remembers the options its platform repeats on an update, and no other', async () => {
    platformFor.mockReturnValue({ ...androidtv, remembers: ['profile', 'serial'] });

    await deployTo(shield, { log, platformOptions: { profile: 'KROMA', passphrase: 'AB12CD' } });

    expect(rememberSet.mock.calls[0]?.[0]).toMatchObject({ options: { profile: 'KROMA' } });
  });

  it('installs with the options remembered for that set', async () => {
    rememberedSets.mockResolvedValue([remembered({ options: { profile: 'KROMA' } })]);

    await deployTo(shield, { log, platformOptions: { native: true } });

    expect(install.mock.calls[0]?.[0]).toMatchObject({
      options: { profile: 'KROMA', native: true },
    });
  });

  it('takes an option that is named over the remembered one', async () => {
    rememberedSets.mockResolvedValue([remembered({ options: { profile: 'KROMA' } })]);

    await deployTo(shield, { log, platformOptions: { profile: 'salon' } });

    expect(install.mock.calls[0]?.[0]).toMatchObject({ options: { profile: 'salon' } });
  });

  it('ignores what was remembered for another kind of set at the same address', async () => {
    rememberedSets.mockResolvedValue([
      remembered({ platform: 'tizen', options: { profile: 'KROMA' } }),
    ]);

    await deployTo(shield, { log });

    expect(install.mock.calls[0]?.[0]).toMatchObject({ options: {} });
  });

  it('keeps remembering the options it reused', async () => {
    platformFor.mockReturnValue({ ...androidtv, remembers: ['profile'] });
    rememberedSets.mockResolvedValue([remembered({ options: { profile: 'KROMA' } })]);

    await deployTo(shield, { log });

    expect(rememberSet.mock.calls[0]?.[0]).toMatchObject({ options: { profile: 'KROMA' } });
  });

  it('remembers no option for a platform that repeats none', async () => {
    await deployTo(shield, { log, platformOptions: { passphrase: 'AB12CD' } });

    expect(rememberSet.mock.calls[0]?.[0]).toMatchObject({ options: undefined });
  });

  it('remembers nothing of a set the install failed on', async () => {
    install.mockRejectedValue(new Error('adb sees the TV as offline'));

    await expect(deployTo(shield, { log })).rejects.toThrow('adb sees the TV as offline');
    expect(rememberSet).not.toHaveBeenCalled();
  });

  it('remembers nothing of a set no address finds again', async () => {
    const appleTv = { ...shield, identifier: 'DAEFE079-2165-4B0D-ACD9-4F44B43BA9FF' };

    await deployTo(appleTv, { log });

    expect(rememberSet).not.toHaveBeenCalled();
  });

  it('counts the install done even when it could not be remembered', async () => {
    rememberSet.mockRejectedValue(new Error('EACCES'));

    await expect(deployTo(shield, { log })).resolves.toBeUndefined();
  });

  it('installs without starting the app when told not to launch', async () => {
    await deployTo(shield, { log, launch: false, platformOptions: { native: true } });

    expect(install.mock.calls[0]?.[0]).toMatchObject({ launch: false, options: { native: true } });
  });
});
