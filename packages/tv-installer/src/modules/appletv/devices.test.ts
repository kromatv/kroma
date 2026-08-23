import { afterEach, describe, expect, it, vi } from 'vitest';
import { devicectl } from './devicectl';
import { listAppleTvs, readAppleTvs } from './devices';

vi.mock('./devicectl', () => ({ devicectl: vi.fn() }));

const salon = {
  identifier: '54519807-3629-5FCC-9B92-0FE3B890595A',
  connectionProperties: {
    authenticationType: 'manualPairing',
    pairingState: 'paired',
    potentialHostnames: [
      'Salon.coredevice.local',
      '54519807-3629-5FCC-9B92-0FE3B890595A.coredevice.local',
    ],
    transportType: 'localNetwork',
    tunnelState: 'disconnected',
  },
  deviceProperties: { developerModeStatus: 'enabled', name: 'Salon', osVersionNumber: '27.0' },
  hardwareProperties: {
    deviceType: 'appleTV',
    marketingName: 'Apple TV 4K (2nd generation)',
    platform: 'tvOS',
    productType: 'AppleTV11,1',
    udid: 'bdbf82b2ced94649fea4fcdb41e52cafb560362b',
  },
};

const iphone = {
  identifier: '1B794ECF-D4DB-587C-A039-199E0D69F76B',
  connectionProperties: {
    pairingState: 'paired',
    transportType: 'localNetwork',
    tunnelState: 'disconnected',
  },
  deviceProperties: { name: 'Maxime', osVersionNumber: '27.0' },
  hardwareProperties: {
    marketingName: 'iPhone 14 Pro Max',
    platform: 'iOS',
    productType: 'iPhone15,3',
  },
};

const listing = (devices: readonly unknown[]) => ({
  info: { commandType: 'devicectl.list.devices', jsonVersion: 3, outcome: 'success' },
  result: { devices },
});

describe('readAppleTvs', () => {
  it('keeps the televisions and leaves every other paired device out', () => {
    expect(readAppleTvs(listing([iphone, salon])).map((tv) => tv.name)).toEqual(['Salon']);
  });

  it('reads a paired set under both of the ids its tools ask for', () => {
    const [tv] = readAppleTvs(listing([salon]));

    expect(tv).toEqual({
      identifier: '54519807-3629-5FCC-9B92-0FE3B890595A',
      udid: 'bdbf82b2ced94649fea4fcdb41e52cafb560362b',
      hostname: 'Salon.coredevice.local',
      name: 'Salon',
      model: 'Apple TV 4K (2nd generation)',
      osVersion: '27.0',
      reachable: true,
      note: 'reachable over localNetwork',
    });
  });

  it('still reaches a set whose tunnel is down, because devicectl opens one per command', () => {
    const [tv] = readAppleTvs(listing([salon]));

    expect(tv?.reachable).toBe(true);
  });

  it('reports a set that has gone off the network rather than dropping it', () => {
    const asleep = {
      ...salon,
      connectionProperties: { pairingState: 'paired', tunnelState: 'unavailable' },
    };

    const [tv] = readAppleTvs(listing([asleep]));

    expect(tv).toMatchObject({
      name: 'Salon',
      reachable: false,
      note: expect.stringContaining('wake it'),
    });
  });

  it('reports a set this Mac was never paired with', () => {
    const stranger = { ...salon, connectionProperties: { pairingState: 'unpaired' } };

    const [tv] = readAppleTvs(listing([stranger]));

    expect(tv).toMatchObject({ reachable: false, note: expect.stringContaining('pair it') });
  });

  it('falls back to the product type for a set with no marketing name', () => {
    const bare = { ...salon, hardwareProperties: { platform: 'tvOS', productType: 'AppleTV14,1' } };

    const [tv] = readAppleTvs(listing([bare]));

    expect(tv).toMatchObject({ model: 'AppleTV14,1', udid: '' });
  });

  it('refuses a document that is not the one devicectl writes', () => {
    expect(() => readAppleTvs({ result: {} })).toThrow();
  });
});

describe('listAppleTvs', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('asks CoreDevice for every device it is paired with', async () => {
    vi.mocked(devicectl).mockResolvedValue({ code: 0, output: '', report: listing([salon]) });

    const paired = await listAppleTvs();

    expect(vi.mocked(devicectl).mock.calls[0]?.[0]).toEqual(['list', 'devices']);
    expect(paired.map((tv) => tv.identifier)).toEqual([salon.identifier]);
  });

  it('quotes what devicectl said when it could not list anything', async () => {
    vi.mocked(devicectl).mockResolvedValue({
      code: 1,
      output: '  ERROR: Xcode is not installed\n',
      report: null,
    });

    await expect(listAppleTvs()).rejects.toThrow(
      'devicectl could not list the paired devices: ERROR: Xcode is not installed',
    );
  });
});
