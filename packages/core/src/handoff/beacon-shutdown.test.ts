// Stopping the loop, including while a request it started is still out.

import type { PairingStatus } from '@kroma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHandoff } from './beacon';
import { BEACON, run, stubClient, tick, USER } from './beacon.fixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
