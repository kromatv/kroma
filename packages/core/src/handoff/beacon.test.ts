// The television's loop, driven on fake timers against a stub client. What it
// has to do: publish and wait, sign in on a grant, start over when the beacon
// lapses, and keep its DNS-SD record in step with whichever beacon is current.

import type { PairingStatus } from '@kroma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type HandoffBeaconView, startHandoff } from './beacon';
import { run, stubClient, tick, USER } from './beacon.fixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('publishing the beacon', () => {
  it('announces this TV and shows what the phone will see', async () => {
    const { client, announces } = stubClient();
    const { beacons, stop } = run(client);
    await tick();

    expect(announces[0]).toEqual({
      deviceId: 'tv-salon-01',
      name: 'Apple TV',
      platform: 'Apple TV',
    });
    expect(beacons.at(-1)).toEqual({ name: 'Apple TV', check: 'K7QMR' });
    stop();
  });

  it('polls on the cadence the server asked for, and not before', async () => {
    const { client } = stubClient();
    const { stop } = run(client);
    await tick();
    expect(client.handoffPoll).not.toHaveBeenCalled();

    await tick(3000);
    expect(client.handoffPoll).toHaveBeenCalledTimes(1);
    await tick(3000);
    expect(client.handoffPoll).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('publishing on this television s own link', () => {
  it('puts the beacon on the link as well as at the server', async () => {
    const published: Array<{ name: string; txt: Record<string, string> }> = [];
    const unpublish = vi.fn();
    const { client } = stubClient();
    const { stop } = startHandoff({
      client,
      deviceId: 'tv-salon-01',
      name: 'Apple TV',
      platform: 'Apple TV',
      publish: (service) => {
        published.push(service);
        return unpublish;
      },
      onBeacon: () => undefined,
      onAuthenticated: () => undefined,
    });
    await tick();

    expect(published).toHaveLength(1);
    expect(published[0]?.name).toBe('Apple TV');
    // The record carries what a phone needs to name the row and to prove it
    // heard this television.
    expect(published[0]?.txt.handle).toBe('h1');
    expect(published[0]?.txt.proof).toBe('p1');
    // Which install minted the handle, so a phone on another server can tell.
    expect(published[0]?.txt.server).toBe('srv-1');
    expect(published[0]?.txt.check).toBe('K7QMR');

    stop();
    expect(unpublish).toHaveBeenCalled();
  });

  it('replaces the record when the beacon rotates, so no stale handle stays audible', async () => {
    const published: Array<{ txt: Record<string, string> }> = [];
    const unpublish = vi.fn();
    const { client } = stubClient({
      handoffPoll: vi.fn(async (): Promise<PairingStatus> => ({ status: 'expired' })),
    });
    const { stop } = startHandoff({
      client,
      deviceId: 'tv-salon-01',
      name: 'Apple TV',
      platform: 'Apple TV',
      publish: (service) => {
        published.push(service);
        return unpublish;
      },
      onBeacon: () => undefined,
      onAuthenticated: () => undefined,
    });
    await tick();
    await tick(3000);

    expect(published.map((p) => p.txt.handle)).toEqual(['h1', 'h2']);
    expect(unpublish).toHaveBeenCalledTimes(1);
    stop();
  });

  it('keeps the record up across polls, rather than taking it down after one', async () => {
    // The record is the whole point of publishing: a beacon that is announced
    // and then goes silent on the link is worse than one never published, since
    // the phone saw it once and will not see it go.
    const published: unknown[] = [];
    const unpublish = vi.fn();
    const { client } = stubClient();
    const { stop } = startHandoff({
      client,
      deviceId: 'tv-salon-01',
      name: 'Apple TV',
      platform: 'Apple TV',
      publish: (service) => {
        published.push(service);
        return unpublish;
      },
      onBeacon: () => undefined,
      onAuthenticated: () => undefined,
    });

    await tick();
    expect(published).toHaveLength(1);

    // Several polls, all pending.
    for (let i = 0; i < 4; i++) await tick(3000);
    expect(client.handoffPoll).toHaveBeenCalledTimes(4);
    expect(unpublish, 'the record was taken down while still waiting').not.toHaveBeenCalled();
    expect(published, 'the record was republished for no reason').toHaveLength(1);

    stop();
  });

  it('publishes under the brand when the television has no name of its own', async () => {
    const published: Array<{ name: string }> = [];
    const { client } = stubClient();
    const { stop } = startHandoff({
      client,
      deviceId: 'tv-salon-01',
      name: '',
      platform: '',
      publish: (service) => {
        published.push(service);
        return () => undefined;
      },
      onBeacon: () => undefined,
      onAuthenticated: () => undefined,
    });
    await tick();
    // A DNS-SD record needs an instance name, and an empty one is not a name.
    expect(published[0]?.name).toBe('KROMA');
    stop();
  });

  it('still pairs through the server when the platform refuses to publish', async () => {
    const publish = vi.fn(() => {
      throw new Error('no local network permission');
    });
    const { client } = stubClient();
    const beacons: Array<HandoffBeaconView | null> = [];
    const { stop } = startHandoff({
      client,
      deviceId: 'tv-salon-01',
      name: 'Apple TV',
      platform: 'Apple TV',
      publish,
      onBeacon: (b) => beacons.push(b),
      onAuthenticated: () => undefined,
    });
    await tick();

    expect(publish).toHaveBeenCalled();
    // The screen still shows the beacon: the server half worked.
    expect(beacons.at(-1)).toEqual({ name: 'Apple TV', check: 'K7QMR' });
    expect(() => stop()).not.toThrow();
  });
});

describe('a phone granting the account', () => {
  it('signs in with what the poll handed back, and stops', async () => {
    const authorized: PairingStatus = {
      status: 'authorized',
      token: 'tok',
      accessToken: 'acc',
      user: USER,
    };
    const { client } = stubClient({
      handoffPoll: vi.fn(async () => authorized),
    });
    const { beacons, signedIn, stop } = run(client);
    await tick();
    await tick(3000);

    expect(signedIn).toEqual([{ token: 'tok' }]);
    // The beacon was consumed server-side, so nothing is taken down.
    expect(beacons.at(-1)).toBeNull();
    expect(client.handoffLeave).not.toHaveBeenCalled();

    // And the loop is done: no further polling.
    await tick(30_000);
    expect(client.handoffPoll).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('a beacon that lapsed', () => {
  it('announces a fresh one, retiring the old secret in the same call', async () => {
    const { client, announces } = stubClient({
      handoffPoll: vi.fn(async (): Promise<PairingStatus> => ({ status: 'expired' })),
    });
    const { stop } = run(client);
    await tick();
    await tick(3000);

    expect(announces).toHaveLength(2);
    expect(announces[1]?.prevSecret).toBe('s1');
    stop();
  });
});

describe('a name the platform only got round to later', () => {
  it('announces again under it, retiring the beacon already out there', async () => {
    const { client, announces } = stubClient();
    const { rename, stop, beacons } = run(client);
    await tick();

    rename('Salon');
    await tick();

    expect(announces).toHaveLength(2);
    expect(announces[1]?.name).toBe('Salon');
    expect(announces[1]?.prevSecret).toBe('s1');
    expect(beacons.at(-1)).toEqual({ name: 'Salon', check: 'K7QMR' });
    stop();
  });

  it('replaces the record on the link, rather than leaving the old name audible', async () => {
    const published: Array<{ name: string; txt: Record<string, string> }> = [];
    const unpublish = vi.fn();
    const { client } = stubClient();
    const { rename, stop } = run(client, (service) => {
      published.push(service);
      return unpublish;
    });
    await tick();

    rename('Salon');
    await tick();

    expect(published.map((p) => p.name)).toEqual(['Apple TV', 'Salon']);
    expect(published.at(-1)?.txt.name).toBe('Salon');
    expect(unpublish).toHaveBeenCalledTimes(1);
    stop();
  });

  it('says nothing again when the name has not actually changed', async () => {
    const { client, announces } = stubClient();
    const { rename, stop } = run(client);
    await tick();

    rename('Apple TV');
    await tick();

    expect(announces).toHaveLength(1);
    stop();
  });

  it('leaves ONE loop running when it lands while the first announce is in flight', async () => {
    const { client, announces, left } = stubClient();
    const { rename, stop } = run(client);
    rename('Salon');
    await tick();

    expect(announces.map((a) => a.name)).toEqual(['Apple TV', 'Salon']);
    // The superseded beacon is taken down instead of sitting in every picker
    // for its TTL under a name this television no longer answers to.
    expect(left).toEqual(['s1']);

    await tick(3000);
    expect(client.handoffPoll).toHaveBeenCalledTimes(1);
    stop();
  });

  it('is ignored once the beacon has been taken down', async () => {
    const { client, announces } = stubClient();
    const { rename, stop } = run(client);
    await tick();

    stop();
    rename('Salon');
    await tick(60_000);
    expect(announces).toHaveLength(1);
  });
});
