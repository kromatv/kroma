import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TvModule } from '../modules/module';
import type { Television } from '../television';
import type { Tool } from '../toolchain/detect';
import { deployTo } from './deploy';

const { moduleFor, installTool, rememberSet } = vi.hoisted(() => ({
  moduleFor: vi.fn((_platform: string): unknown => undefined),
  installTool: vi.fn(async (_tool: unknown, _log: unknown) => '/usr/bin/adb'),
  rememberSet: vi.fn(async (_set: unknown) => {}),
}));
vi.mock('../modules/registry', () => ({ moduleFor }));
vi.mock('../toolchain/install', () => ({ installTool }));
vi.mock('../remembered', () => ({ rememberSet }));

const adb: Tool = {
  id: 'adb',
  label: 'Android Debug Bridge',
  binary: 'adb',
  source: 'dl.google.com platform-tools',
};

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

const androidtv: TvModule = {
  id: 'androidtv',
  label: 'Android TV',
  brands: 'Philips, Sony, TCL, Shield, Chromecast',
  package: '.apk',
  notReadyHint: 'network debugging off',
  tools: () => [adb],
  sources: () => [],
  resolve,
  install,
};

const log = () => {};

beforeEach(() => {
  steps.length = 0;
  resolve.mockClear();
  install.mockClear();
  rememberSet.mockReset();
  rememberSet.mockResolvedValue(undefined);
  installTool.mockReset();
  installTool.mockImplementation(async () => {
    steps.push('tool');
    return '/usr/bin/adb';
  });
  resolve.mockImplementation(async () => {
    steps.push('resolve');
    return '/out/KROMA.apk';
  });
  install.mockImplementation(async () => void steps.push('install'));
  moduleFor.mockReturnValue(androidtv);
});

describe('deployTo', () => {
  it('installs the toolchain the platform needs before it looks for a package', async () => {
    await deployTo(shield, { log });

    expect(installTool).toHaveBeenCalledWith(adb, log);
    expect(steps).toEqual(['tool', 'resolve', 'install']);
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
    moduleFor.mockReturnValue({ ...androidtv, remembers: ['profile', 'serial'] });

    await deployTo(shield, { log, moduleOptions: { profile: 'KROMA', passphrase: 'AB12CD' } });

    expect(rememberSet.mock.calls[0]?.[0]).toMatchObject({ options: { profile: 'KROMA' } });
  });

  it('remembers no option for a platform that repeats none', async () => {
    await deployTo(shield, { log, moduleOptions: { passphrase: 'AB12CD' } });

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
    await deployTo(shield, { log, launch: false, moduleOptions: { native: true } });

    expect(install.mock.calls[0]?.[0]).toMatchObject({ launch: false, options: { native: true } });
  });
});
