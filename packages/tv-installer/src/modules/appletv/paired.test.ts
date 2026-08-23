import { describe, expect, it, vi } from 'vitest';
import type { AppleTv } from './index';
import { pairedTelevisions } from './paired';

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

const { listAppleTvs, locateAppleTvTool } = vi.hoisted(() => ({
  listAppleTvs: vi.fn(async (): Promise<AppleTv[]> => []),
  locateAppleTvTool: vi.fn((): string | null => '/usr/bin/devicectl'),
}));
vi.mock('./index', () => ({ listAppleTvs, locateAppleTvTool }));

describe('pairedTelevisions', () => {
  it('lists a paired set under the hostname its tools address it by', async () => {
    listAppleTvs.mockResolvedValueOnce([salon]);

    const [tv] = await pairedTelevisions();

    expect(tv).toMatchObject({
      host: 'Salon.coredevice.local',
      platform: 'appletv',
      vendor: 'Apple',
      name: 'Salon',
      model: 'Apple TV 4K (2nd generation)',
      developerMode: 'on',
      sideloadable: true,
      note: 'reachable over localNetwork',
      identifier: '54519807-3629-5FCC-9B92-0FE3B890595A',
    });
  });

  it('takes the tvOS version off the set, and names no browser engine', async () => {
    listAppleTvs.mockResolvedValueOnce([salon]);

    const [tv] = await pairedTelevisions();

    expect(tv?.runtime).toEqual({
      name: 'tvOS',
      version: '27.0',
      engine: { name: 'React Native', version: null },
      learned: 'reported',
    });
  });

  it('marks a set that has gone off the network as not ready', async () => {
    listAppleTvs.mockResolvedValueOnce([{ ...salon, reachable: false, note: 'off the network' }]);

    const [tv] = await pairedTelevisions();

    expect(tv).toMatchObject({ developerMode: 'off', note: 'off the network' });
  });

  it('falls back to the CoreDevice identifier for a set that published no hostname', async () => {
    listAppleTvs.mockResolvedValueOnce([{ ...salon, hostname: '' }]);

    const [tv] = await pairedTelevisions();

    expect(tv?.host).toBe('54519807-3629-5FCC-9B92-0FE3B890595A');
  });

  it('leaves the runtime out for a set that named no tvOS version', async () => {
    listAppleTvs.mockResolvedValueOnce([{ ...salon, osVersion: '' }]);

    const [tv] = await pairedTelevisions();

    expect(tv?.runtime).toBeNull();
  });

  it('answers nothing on a machine with no Xcode to ask', async () => {
    locateAppleTvTool.mockReturnValueOnce(null);
    listAppleTvs.mockClear();

    const sets = await pairedTelevisions();

    expect(sets).toEqual([]);
    expect(listAppleTvs).not.toHaveBeenCalled();
  });

  it('answers nothing rather than failing the scan when CoreDevice refuses', async () => {
    listAppleTvs.mockRejectedValueOnce(new Error('devicectl could not list the paired devices'));

    const sets = await pairedTelevisions();

    expect(sets).toEqual([]);
  });
});
