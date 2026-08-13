// @vitest-environment jsdom
//
// The phone's picker as a hook: what it lists, what it does when a tap grants
// the account, and what it does when that tap arrives a moment too late or
// carries the wrong code.

import { KromaApiError, type KromaClient } from '@kroma/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveredTv, LanService } from '../handoff';
import { beaconTxt } from '../handoff';
import { useNearbyTvs } from './nearby-tvs';

const SALON: DiscoveredTv = {
  handle: 'h-salon',
  name: 'Salon',
  platform: 'tvOS',
  check: 'K7QMR',
  confirmRequired: false,
  via: 'server',
};
const CHAMBRE: DiscoveredTv = {
  handle: 'h-chambre',
  name: 'Chambre',
  platform: 'Tizen',
  check: 'B4XRT',
  confirmRequired: true,
  via: 'server',
};

function stubClient(rows: DiscoveredTv[] = [SALON, CHAMBRE]) {
  return {
    handoffDevices: vi.fn(async () => rows),
    handoffGrant: vi.fn(async () => undefined),
    health: vi.fn(async () => ({ instanceId: 'srv-1' })),
  } as unknown as KromaClient;
}

function refused(status: number) {
  return new KromaApiError(status, `POST /handoff/grant failed (${status})`);
}

// A phone that can hear its own link, publishing one television's record.
function stubLan(services: LanService[]) {
  return {
    browse(onFound: (found: LanService[]) => void) {
      onFound(services);
      return () => undefined;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('while the picker is open', () => {
  it('lists the TVs waiting on this network', async () => {
    const { result } = renderHook(() => useNearbyTvs({ client: stubClient() }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));
    // Sorted, not in the order a source happened to answer in: the list sits
    // under a thumb and must not reshuffle when the next poll lands.
    expect(result.current.devices.map((d) => d.name)).toEqual(['Chambre', 'Salon']);
    expect(result.current.connecting).toBeNull();
  });

  it('lists nothing at all without a session', () => {
    const { result } = renderHook(() => useNearbyTvs({ client: null }));
    expect(result.current.devices).toEqual([]);
  });

  // An older server answers /health without an instanceId at all. Nothing can be
  // dropped for belonging elsewhere then, so every row it found is listed.
  it('lists everything when the server names no install', async () => {
    const client = stubClient();
    (client as unknown as { health: () => Promise<unknown> }).health = vi.fn(async () => ({}));
    const { result } = renderHook(() => useNearbyTvs({ client }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));
  });

  // The picker is closed before /health lands. Writing state into a hook nobody
  // is rendering any more is the classic React warning, and the guard is why it
  // does not happen here.
  it('drops the answer that arrives after the picker has gone', async () => {
    let release!: (h: { instanceId: string }) => void;
    const held = new Promise<{ instanceId: string }>((resolve) => {
      release = resolve;
    });
    const client = stubClient();
    (client as unknown as { health: () => Promise<unknown> }).health = vi.fn(async () => held);

    const { unmount } = renderHook(() => useNearbyTvs({ client }));
    unmount();
    release({ instanceId: 'srv-1' });
    await expect(held).resolves.toEqual({ instanceId: 'srv-1' });
  });

  // Which install this phone belongs to is only used to DROP rows minted by
  // another one. A server that will not say must therefore cost nothing: the
  // picker still lists what it found rather than going empty.
  it('still lists the TVs when the server will not say which install it is', async () => {
    const client = stubClient();
    (client as unknown as { health: () => Promise<unknown> }).health = vi.fn(async () => {
      throw new Error('offline');
    });
    const { result } = renderHook(() => useNearbyTvs({ client }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));
  });
});

describe('a phone that can hear its own link', () => {
  it('merges what it heard with what the server listed, and prefers what it heard', async () => {
    const client = stubClient([SALON]);
    const lan = stubLan([
      {
        name: 'Salon',
        txt: beaconTxt({
          state: 'waiting',
          server: 'srv-1',
          handle: 'h-salon',
          name: 'Salon',
          platform: 'tvOS',
          check: 'K7QMR',
          proof: 'heard-it',
        }),
      },
    ]);
    const { result } = renderHook(() => useNearbyTvs({ client, lan }));
    // The link answers on the spot and the server a request later, so waiting
    // for one row would be waiting for the heard copy alone. The server's word
    // on the confirmation is what only the merged row carries.
    await waitFor(() => expect(result.current.devices[0]?.confirmRequired).toBe(false));

    expect(result.current.devices).toHaveLength(1);
    expect(result.current.devices[0]?.via).toBe('lan');
    expect(result.current.devices[0]?.proof).toBe('heard-it');
  });

  it('leaves the code to the grant on a television the server never listed', async () => {
    const client = stubClient([]);
    const lan = stubLan([
      {
        name: 'Salon',
        txt: beaconTxt({
          state: 'waiting',
          server: 'srv-1',
          handle: 'h-salon',
          name: 'Salon',
          platform: 'tvOS',
          check: 'K7QMR',
          proof: 'heard-it',
        }),
      },
    ]);
    const { result } = renderHook(() => useNearbyTvs({ client, lan }));
    await waitFor(() => expect(result.current.devices).toHaveLength(1));

    // Nothing here knows, so nothing here guesses: the grant asks, and a beacon
    // that wants its check is refused without one.
    expect(result.current.devices[0]?.confirmRequired).toBe(false);
  });

  it('does not offer a television belonging to a different server', async () => {
    // A household can have two servers, or a laptop can be running one. The
    // handle in that television's record means nothing to THIS server, so
    // granting it answers "no longer waiting" every single time. A row that
    // cannot work should not be a row.
    // Two televisions on the link, one belonging to this server and one not.
    // Waiting for the ours-only list is a positive assertion: an empty list
    // would pass before the filter had done anything at all.
    const client = stubClient([]);
    const lan = stubLan([
      {
        name: 'Salon',
        txt: beaconTxt({
          state: 'waiting',
          server: 'some-other-server',
          handle: 'h-theirs',
          name: 'Salon',
          platform: 'tvOS',
          check: 'K7QMR',
          proof: 'heard-it',
        }),
      },
      {
        name: 'Chambre',
        txt: beaconTxt({
          state: 'waiting',
          server: 'srv-1',
          handle: 'h-ours',
          name: 'Chambre',
          platform: 'tvOS',
          check: 'B4XRT',
          proof: 'heard-it-too',
        }),
      },
    ]);
    const { result } = renderHook(() => useNearbyTvs({ client, lan }));

    await waitFor(() => expect(result.current.devices.map((d) => d.handle)).toEqual(['h-ours']));
  });

  it('starts each source once, however late the server names itself', async () => {
    // Learning our own install id is what tells a foreign row from one of ours,
    // and it lands a beat after mount. It must not restart the watchers: that
    // costs a second `/handoff/devices` inside a second, and a link browse that
    // stops and starts can report one empty list on the way back up.
    const client = stubClient([SALON]);
    let browses = 0;
    const lan = {
      browse(onFound: (found: LanService[]) => void) {
        browses += 1;
        onFound([
          {
            name: 'Cuisine',
            txt: beaconTxt({
              state: 'waiting',
              server: 'some-other-server',
              handle: 'h-theirs',
              name: 'Cuisine',
              platform: 'tvOS',
              check: 'B4XRT',
              proof: 'heard-it',
            }),
          },
        ]);
        return () => undefined;
      },
    };
    const { result } = renderHook(() => useNearbyTvs({ client, lan }));

    // The foreign row leaves only once the health answer has landed, so this
    // waits for exactly the state change that used to restart everything.
    await waitFor(() => expect(result.current.devices.map((d) => d.handle)).toEqual(['h-salon']));
    expect(browses).toBe(1);
    expect(client.handoffDevices).toHaveBeenCalledTimes(1);
  });

  it('sends the proof it heard along with the grant', async () => {
    const client = stubClient([]);
    const lan = stubLan([
      {
        name: 'Salon',
        txt: beaconTxt({
          state: 'waiting',
          server: 'srv-1',
          handle: 'h-salon',
          name: 'Salon',
          platform: 'tvOS',
          check: 'K7QMR',
          proof: 'heard-it',
        }),
      },
    ]);
    const { result } = renderHook(() => useNearbyTvs({ client, lan }));
    await waitFor(() => expect(result.current.devices).toHaveLength(1));

    const heard = result.current.devices[0];
    if (!heard) throw new Error('expected the heard row');
    await act(async () => {
      await result.current.connect(heard);
    });
    expect(client.handoffGrant).toHaveBeenCalledWith('h-salon', {
      proof: 'heard-it',
      check: undefined,
    });
  });
});

describe('tapping a TV', () => {
  it('grants that TV and drops its row, because it is no longer waiting', async () => {
    const client = stubClient();
    const { result } = renderHook(() => useNearbyTvs({ client }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));

    let granted: string | undefined;
    await act(async () => {
      granted = await result.current.connect(SALON);
    });

    expect(granted).toBe('granted');
    expect(client.handoffGrant).toHaveBeenCalledWith('h-salon', {
      proof: undefined,
      check: undefined,
    });
    expect(result.current.devices.map((d) => d.name)).toEqual(['Chambre']);
    expect(result.current.connecting).toBeNull();
  });

  it('carries the code a person read off the television', async () => {
    const client = stubClient();
    const { result } = renderHook(() => useNearbyTvs({ client }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));

    await act(async () => {
      await result.current.connect(CHAMBRE, 'B4XRT');
    });
    expect(client.handoffGrant).toHaveBeenCalledWith('h-chambre', {
      proof: undefined,
      check: 'B4XRT',
    });
  });

  it('says so when that TV stopped waiting, and keeps the list usable', async () => {
    const client = stubClient();
    vi.mocked(client.handoffGrant).mockRejectedValue(refused(404));
    const { result } = renderHook(() => useNearbyTvs({ client }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.connect(SALON);
    });

    expect(outcome).toBe('gone');
    expect(result.current.connecting).toBeNull();
    // Nothing was dropped: the row is still there to try again, or to pick the
    // other TV instead.
    expect(result.current.devices).toHaveLength(2);
  });

  it('tells a wrong code from a spent beacon, and from a success', async () => {
    // The whole point of answering per call: a wrong code that read as anything
    // else would either lose the retry or claim a sign-in nobody got.
    const client = stubClient();
    const { result } = renderHook(() => useNearbyTvs({ client }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));

    for (const [status, expected] of [
      [400, 'checkRequired'],
      [403, 'checkWrong'],
      [429, 'checkTooMany'],
    ] as const) {
      vi.mocked(client.handoffGrant).mockRejectedValueOnce(refused(status));
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.connect(CHAMBRE, 'WRONG');
      });
      expect(outcome).toBe(expected);
      // A refusal leaves the beacon standing as far as this hook is concerned:
      // the row is only dropped by a grant that went through.
      expect(result.current.devices).toHaveLength(2);
    }
  });

  it('answers every attempt, so two wrong codes in a row are two answers', async () => {
    const client = stubClient();
    vi.mocked(client.handoffGrant).mockRejectedValue(refused(403));
    const { result } = renderHook(() => useNearbyTvs({ client }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));

    const answers: string[] = [];
    await act(async () => {
      answers.push(await result.current.connect(CHAMBRE, 'AAAAA'));
      answers.push(await result.current.connect(CHAMBRE, 'BBBBB'));
    });
    expect(answers).toEqual(['checkWrong', 'checkWrong']);
  });

  it('drops a second grant sent while one is in flight, and says it dropped it', async () => {
    // Reading that as a success would sign in a television nobody granted.
    const client = stubClient();
    let release: (() => void) | undefined;
    vi.mocked(client.handoffGrant).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );
    const { result } = renderHook(() => useNearbyTvs({ client }));
    await waitFor(() => expect(result.current.devices).toHaveLength(2));

    let first: Promise<string> | undefined;
    let second: string | undefined;
    await act(async () => {
      first = result.current.connect(SALON);
      second = await result.current.connect(CHAMBRE);
    });
    expect(second).toBe('dropped');

    await act(async () => {
      release?.();
      await first;
    });
    expect(client.handoffGrant).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a session', async () => {
    const { result } = renderHook(() => useNearbyTvs({ client: null }));
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.connect(SALON);
    });
    expect(outcome).toBe('dropped');
    expect(result.current.connecting).toBeNull();
  });
});
