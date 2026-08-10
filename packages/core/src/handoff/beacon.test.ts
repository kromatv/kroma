// The television's loop, driven on fake timers against a stub client. What it
// has to do: publish and wait, sign in on a grant, start over when the beacon
// lapses, stay quiet when the server refuses, and keep its DNS-SD record in
// step with whichever beacon is current.

import { KromaApiError, type KromaClient, type PairingStatus, type User } from '@kroma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type HandoffBeaconView, type HandoffLoopOptions, startHandoff } from './beacon';

const USER = { id: 'u1', username: 'owner' } as unknown as User;

const BEACON = {
  handle: 'h1',
  secret: 's1',
  check: 'K7QMR',
  confirmRequired: false,
  proof: 'p1',
  instanceId: 'srv-1',
  ttlSecs: 60,
  pollSecs: 3,
};

function stubClient(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  const announces: Array<{ deviceId: string; name: string; prevSecret?: string }> = [];
  const left: string[] = [];
  let minted = 0;
  const client = {
    announceHandoff: vi.fn(
      async (body: { deviceId: string; name: string; prevSecret?: string }) => {
        calls.push('announce');
        announces.push(body);
        minted += 1;
        return { ...BEACON, secret: `s${minted}`, handle: `h${minted}`, proof: `p${minted}` };
      },
    ),
    handoffPoll: vi.fn(async (): Promise<PairingStatus> => {
      calls.push('poll');
      return { status: 'pending' };
    }),
    handoffLeave: vi.fn(async (secret: string) => {
      calls.push('leave');
      left.push(secret);
    }),
    ...overrides,
  } as unknown as KromaClient;
  return { client, calls, announces, left };
}

function run(client: KromaClient, publish?: HandoffLoopOptions['publish']) {
  const beacons: Array<HandoffBeaconView | null> = [];
  const signedIn: Array<{ token: string }> = [];
  const handoff = startHandoff({
    client,
    deviceId: 'tv-salon-01',
    name: 'Apple TV',
    platform: 'Apple TV',
    publish,
    onBeacon: (b) => beacons.push(b),
    onAuthenticated: (r) => signedIn.push({ token: r.token }),
  });
  return { ...handoff, beacons, signedIn };
}

// Let every already-resolved promise settle, then advance to the next timer.
async function tick(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

function refusing(status: number, route = '/handoff/announce') {
  return vi.fn(async () => {
    throw new KromaApiError(status, `POST ${route} failed (${status})`);
  });
}

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

describe('a poll that did not answer', () => {
  it('keeps the beacon and tries again rather than re-announcing', async () => {
    const { client, announces } = stubClient({
      handoffPoll: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    const { stop } = run(client);
    await tick();
    await tick(3000);
    await tick(3000);

    expect(announces).toHaveLength(1);
    expect(client.handoffPoll).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('an announce that did not go through', () => {
  it('shows nothing and retries slowly, leaving the code path alone', async () => {
    const announce = vi.fn(async () => {
      throw new Error('offline');
    });
    const { client } = stubClient({ announceHandoff: announce });
    const { beacons, stop } = run(client);
    await tick();

    expect(beacons.at(-1)).toBeNull();
    expect(client.handoffPoll).not.toHaveBeenCalled();

    await tick(15_000);
    expect(announce).toHaveBeenCalledTimes(2);
    stop();
  });

  it('keeps asking while this network is already holding all it may', async () => {
    const announce = refusing(429);
    const { client } = stubClient({ announceHandoff: announce });
    const { stop } = run(client);
    await tick();
    await tick(15_000);
    await tick(15_000);

    expect(announce).toHaveBeenCalledTimes(3);
    stop();
  });

  it('keeps asking through a server that is having a bad time', async () => {
    const announce = refusing(503);
    const { client } = stubClient({ announceHandoff: announce });
    const { stop } = run(client);
    await tick();
    await tick(15_000);

    expect(announce).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('a server this television may never raise a beacon on', () => {
  it('stops asking when the origin is refused, rather than every 15s forever', async () => {
    const announce = refusing(403);
    const { client } = stubClient({ announceHandoff: announce });
    const { beacons, stop } = run(client);
    await tick();

    expect(beacons.at(-1)).toBeNull();

    await tick(60_000);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(client.handoffPoll).not.toHaveBeenCalled();
    stop();
    expect(client.handoffLeave).not.toHaveBeenCalled();
  });

  it('stops asking a server too old to have the route at all', async () => {
    const announce = refusing(404);
    const { client } = stubClient({ announceHandoff: announce });
    const { beacons, stop } = run(client);
    await tick();
    await tick(60_000);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(beacons.at(-1)).toBeNull();
    stop();
  });

  it('ignores a rename once it has given up, since a name was never the problem', async () => {
    const announce = refusing(403);
    const { client } = stubClient({ announceHandoff: announce });
    const { rename, stop } = run(client);
    await tick();

    rename('Salon');
    await tick(60_000);

    expect(announce).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops polling one it did raise, taking its record off the link', async () => {
    const unpublish = vi.fn();
    const { client } = stubClient({ handoffPoll: refusing(403, '/handoff/poll') });
    const { beacons, stop } = run(client, () => unpublish);
    await tick();
    await tick(3000);

    expect(client.handoffPoll).toHaveBeenCalledTimes(1);
    expect(beacons.at(-1)).toBeNull();
    expect(unpublish).toHaveBeenCalledTimes(1);

    await tick(60_000);
    expect(client.handoffPoll).toHaveBeenCalledTimes(1);
    expect(client.announceHandoff).toHaveBeenCalledTimes(1);

    // The beacon lapses on its own: taking it down asks the same refused route.
    stop();
    expect(client.handoffLeave).not.toHaveBeenCalled();
  });
});

describe('a television whose origin the server cannot place', () => {
  it('announces once and settles into its poll cadence, rather than giving up', async () => {
    // A packaged Tizen or webOS app presents `Origin: null`, which is what a
    // sandboxed iframe presents too. That used to be refused outright, and the
    // loop stops for good on a refusal it cannot outlive. It is answered now,
    // with a beacon that will cost the person the check string on screen - so
    // the giving-up path must not fire, and the loop has to be RUNNING rather
    // than merely not stopped.
    const announce = vi.fn(async () => ({ ...BEACON, confirmRequired: true }));
    const unpublish = vi.fn();
    const { client } = stubClient({ announceHandoff: announce });
    const { beacons, stop } = run(client, () => unpublish);
    await tick();

    expect(announce).toHaveBeenCalledTimes(1);
    expect(beacons.at(-1)).toEqual({ name: 'Apple TV', check: 'K7QMR' });

    for (let polls = 1; polls <= 5; polls++) {
      await tick(3000);
      expect(client.handoffPoll).toHaveBeenCalledTimes(polls);
    }

    // One beacon, still the current one: no retry loop, no re-announce, and
    // nothing took the record off the link or blanked the screen.
    expect(announce).toHaveBeenCalledTimes(1);
    expect(beacons).not.toContain(null);
    expect(unpublish).not.toHaveBeenCalled();

    stop();
  });

  it('collects the account when a phone that answered the code grants it', async () => {
    const authorized: PairingStatus = {
      status: 'authorized',
      token: 'tok',
      accessToken: 'acc',
      user: USER,
    };
    const { client } = stubClient({
      announceHandoff: vi.fn(async () => ({ ...BEACON, confirmRequired: true })),
      handoffPoll: vi.fn(async () => authorized),
    });
    const { signedIn, stop } = run(client);
    await tick();
    await tick(3000);

    expect(signedIn).toEqual([{ token: 'tok' }]);
    stop();
  });
});

describe('stopping', () => {
  it('takes the beacon down instead of leaving it on every phone', async () => {
    const { client, left } = stubClient();
    const { beacons, stop } = run(client);
    await tick();

    stop();
    expect(left).toEqual(['s1']);
    expect(beacons.at(-1)).toBeNull();

    // Nothing is in flight afterwards, however long the caller waits.
    await tick(60_000);
    expect(client.announceHandoff).toHaveBeenCalledTimes(1);
    expect(client.handoffPoll).not.toHaveBeenCalled();
  });

  it('takes down a beacon the server minted after the stop', async () => {
    // The television signed in another way while the announce was in flight.
    // Discarding the reply would leave a row in every nearby picker for the
    // full TTL, offering a grant nothing will ever collect.
    const { client, left } = stubClient();
    const { stop } = run(client);
    stop();
    await tick();

    expect(left).toEqual(['s1']);
    expect(client.handoffPoll).not.toHaveBeenCalled();
  });

  it('schedules nothing more when a poll in flight fails after the stop', async () => {
    let reject: ((cause: Error) => void) | undefined;
    const handoffPoll = vi.fn(
      () =>
        new Promise<PairingStatus>((_resolve, r) => {
          reject = r;
        }),
    );
    const { client } = stubClient({ handoffPoll });
    const { stop } = run(client);
    await tick();
    await tick(3000);

    stop();
    reject?.(new Error('offline'));
    await tick();

    // The retry the failed poll would have queued was never armed.
    await tick(60_000);
    expect(handoffPoll).toHaveBeenCalledTimes(1);
  });

  it('does not sign in on a grant that lands after the stop', async () => {
    let resolve: ((status: PairingStatus) => void) | undefined;
    const { client } = stubClient({
      handoffPoll: vi.fn(
        () =>
          new Promise<PairingStatus>((r) => {
            resolve = r;
          }),
      ),
    });
    const { signedIn, stop } = run(client);
    await tick();
    await tick(3000);

    stop();
    resolve?.({ status: 'authorized', token: 'tok', accessToken: 'acc', user: USER });
    await tick();
    expect(signedIn).toEqual([]);
  });

  it('shows no beacon for an announce that fails after the stop', async () => {
    let reject: ((cause: Error) => void) | undefined;
    const { client } = stubClient({
      announceHandoff: vi.fn(
        () =>
          new Promise((_resolve, r) => {
            reject = r;
          }),
      ),
    });
    const { beacons, stop } = run(client);

    stop();
    const before = beacons.length;
    reject?.(new Error('refused'));
    await tick();

    // The stop already published the empty state; the late failure adds nothing.
    expect(beacons).toHaveLength(before);
    await tick(60_000);
    expect(client.announceHandoff).toHaveBeenCalledTimes(1);
  });

  it('survives a leave the server refuses', async () => {
    const { client } = stubClient({
      handoffLeave: vi.fn(async () => {
        throw new Error('gone');
      }),
    });
    const { stop } = run(client);
    await tick();
    expect(() => stop()).not.toThrow();
    await tick();
  });
});

// The loop is stopped from outside (the screen went away, the set signed in
// another way) and a request is already out. When it lands, the one place that
// schedules the next step has to notice: otherwise a television nobody is
// looking at goes on polling for the rest of the session.
describe('stopping while a request is in flight', () => {
  it('schedules nothing once the answer arrives', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { client } = stubClient({
      announceHandoff: vi.fn(async () => {
        await held;
        return BEACON;
      }),
    });

    const { stop } = run(client);
    // The announce is out and nothing has come back yet.
    stop();
    release();
    await tick();

    // Nothing was armed behind it, however long anyone waits.
    await tick(120_000);
    expect(client.handoffPoll).not.toHaveBeenCalled();
  });

  // The screen is told about its beacon and tears itself down on the spot: the
  // television signed in another way, or the gate closed. `onBeacon` runs
  // immediately before the next step is armed, so this is the one moment the
  // loop can be stopped between deciding to wait and waiting.
  it('arms nothing when the screen stops it on hearing its own beacon', async () => {
    const { client } = stubClient();
    let handle: { stop: () => void } | undefined;
    handle = startHandoff({
      client,
      deviceId: 'tv-salon-01',
      name: 'Apple TV',
      platform: 'Apple TV',
      onBeacon: (b) => {
        if (b) handle?.stop();
      },
      onAuthenticated: () => undefined,
    });
    await tick();

    await tick(120_000);
    expect(client.handoffPoll).not.toHaveBeenCalled();
  });
});
