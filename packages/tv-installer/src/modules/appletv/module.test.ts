import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Television } from '../../television';
import type { AppleTv } from './index';
import { appletv } from './module';

const { listAppleTvs, resolveAppleTvApp, installAppleTv } = vi.hoisted(() => ({
  listAppleTvs: vi.fn(async (): Promise<AppleTv[]> => []),
  resolveAppleTvApp: vi.fn(async (_request: unknown) => '/kroma/KROMA.app'),
  installAppleTv: vi.fn(async (_install: unknown) => {}),
}));
vi.mock('./index', () => ({
  appleTvSources: () => ['local'],
  installAppleTv,
  listAppleTvs,
  locateAppleTvTool: () => '/usr/bin/devicectl',
  resolveAppleTvApp,
}));

const salon: AppleTv = {
  identifier: '54519807-3629-5FCC-9B92-0FE3B890595A',
  udid: 'bdbf82b2ced94649fea4fcdb41e52cafb560362b',
  hostname: 'Salon.coredevice.local',
  name: 'Salon',
  model: 'Apple TV 4K (2nd generation)',
  osVersion: '27.0',
  reachable: true,
  note: 'reachable over localNetwork',
};

const tv: Television = {
  host: 'Salon.coredevice.local',
  platform: 'appletv',
  vendor: 'Apple',
  name: 'Salon',
  model: 'Apple TV 4K (2nd generation)',
  developerMode: 'on',
  sideloadable: true,
  note: 'reachable over localNetwork',
  runtime: null,
  identifier: '54519807-3629-5FCC-9B92-0FE3B890595A',
};

const log = () => {};

beforeEach(() => {
  listAppleTvs.mockReset();
  resolveAppleTvApp.mockReset();
  installAppleTv.mockReset();
  listAppleTvs.mockResolvedValue([salon]);
  resolveAppleTvApp.mockResolvedValue('/kroma/KROMA.app');
});

describe('appletv.install', () => {
  it('installs on the set CoreDevice still knows by that identifier', async () => {
    await appletv.install({ tv, artifact: '/kroma/KROMA.app', log, launch: true, options: {} });

    expect(installAppleTv).toHaveBeenCalledWith({
      identifier: '54519807-3629-5FCC-9B92-0FE3B890595A',
      app: '/kroma/KROMA.app',
      log,
      launch: true,
    });
  });

  it('refuses a set this Mac is no longer paired with', async () => {
    listAppleTvs.mockResolvedValue([]);

    await expect(
      appletv.install({ tv, artifact: '/kroma/KROMA.app', log, launch: true, options: {} }),
    ).rejects.toThrow('Salon is no longer paired with this Mac: pair it again in Xcode');
  });
});

describe('appletv.resolve', () => {
  it('asks the build for the hardware udid, which is not the identifier it installs by', async () => {
    await appletv.resolve({ tv, log });

    expect(resolveAppleTvApp).toHaveBeenCalledWith({
      given: undefined,
      source: undefined,
      udid: 'bdbf82b2ced94649fea4fcdb41e52cafb560362b',
      log,
    });
  });

  it('builds from source only when that is the source that was named', async () => {
    await appletv.resolve({ tv, log, source: 'build' });

    expect(resolveAppleTvApp.mock.calls[0]?.[0]).toMatchObject({ source: 'build' });
  });

  it('has no release to pull from, so any other source falls back to a local app', async () => {
    await appletv.resolve({ tv, log, source: 'canary' });

    expect(resolveAppleTvApp.mock.calls[0]?.[0]).toMatchObject({ source: undefined });
  });

  it('finds the set by name when the scan recorded no identifier for it', async () => {
    await appletv.resolve({ tv: { ...tv, identifier: undefined }, log });

    expect(resolveAppleTvApp.mock.calls[0]?.[0]).toMatchObject({ udid: salon.udid });
  });

  it('refuses a set this Mac is no longer paired with', async () => {
    listAppleTvs.mockResolvedValue([]);

    await expect(appletv.resolve({ tv, log })).rejects.toThrow('is no longer paired with this Mac');
  });
});
