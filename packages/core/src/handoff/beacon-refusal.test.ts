// The paths where the server says no: a poll that never answered, an announce
// it refused, and an origin it will not raise a beacon for.

import type { PairingStatus } from '@kroma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEACON, refusing, run, stubClient, tick, USER } from './beacon.fixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
