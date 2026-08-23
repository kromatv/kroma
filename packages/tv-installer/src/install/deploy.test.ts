import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TvModule } from '../modules/module';
import type { Television } from '../television';
import type { Tool } from '../toolchain/detect';
import { deployTo } from './deploy';

const { moduleFor, installTool } = vi.hoisted(() => ({
  moduleFor: vi.fn((_platform: string): unknown => undefined),
  installTool: vi.fn(async (_tool: unknown, _log: unknown) => '/usr/bin/adb'),
}));
vi.mock('../modules/registry', () => ({ moduleFor }));
vi.mock('../toolchain/install', () => ({ installTool }));

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

  it('installs without starting the app when told not to launch', async () => {
    await deployTo(shield, { log, launch: false, moduleOptions: { native: true } });

    expect(install.mock.calls[0]?.[0]).toMatchObject({ launch: false, options: { native: true } });
  });
});
