import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DirectConnectionOptions,
  type LanPermission,
  startDirectConnection,
} from './direct-connection';
import { CANONICAL, clientOffering, LAN, network, OFFER } from './direct.fixture';

const OUR_SERVER = { instanceId: 'srv-1', proofs: { n1: 'a1' } };
const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const settle = () => vi.advanceTimersByTimeAsync(0);

function watch(
  offer = OFFER,
  options: Partial<DirectConnectionOptions> & { hosts?: Parameters<typeof network>[0] } = {},
) {
  const { client, calls } = clientOffering(offer);
  const lan = network(options.hosts ?? { [LAN]: OUR_SERVER });
  const onChange = vi.fn();
  const connection = startDirectConnection(client, { fetch: lan.fetch, onChange, ...options });
  const offersAsked = () =>
    calls.filter((call) => call.url === `${CANONICAL}/api/server/direct`).length;
  return { client, connection, lan, onChange, offersAsked };
}

const allowing = (permission: LanPermission) => () => Promise.resolve(permission);

describe('startDirectConnection', () => {
  it('takes the direct route as soon as someone is signed in', async () => {
    const { client, connection, onChange } = watch();

    connection.setSignedIn(true);
    await settle();

    expect(client.route.direct()).toBe(LAN);
    expect(onChange).toHaveBeenLastCalledWith({ route: LAN, askable: false });
  });

  it('asks nothing before a sign-in', async () => {
    const { offersAsked } = watch();

    await vi.advanceTimersByTimeAsync(10 * MINUTE);

    expect(offersAsked()).toBe(0);
  });

  it('does not probe while the browser has yet to be asked, and offers to ask', async () => {
    const { client, connection, lan } = watch(OFFER, { permission: allowing('prompt') });

    connection.setSignedIn(true);
    await settle();

    expect(lan.fetch).not.toHaveBeenCalled();
    expect(client.route.direct()).toBeUndefined();
    expect(connection.state()).toEqual({ route: undefined, askable: true });
  });

  it('offers nothing to a browser the server does not place on its network', async () => {
    const { connection } = watch(
      { ...OFFER, sameNetwork: false },
      { permission: allowing('prompt') },
    );

    connection.setSignedIn(true);
    await settle();

    expect(connection.state().askable).toBe(false);
  });

  it('takes the route when the person asks for it', async () => {
    const { client, connection } = watch(OFFER, { permission: allowing('prompt') });
    connection.setSignedIn(true);
    await settle();

    const outcome = await connection.connectNow();

    expect(outcome).toEqual({ kind: 'direct', route: LAN });
    expect(client.route.direct()).toBe(LAN);
    expect(connection.state().askable).toBe(false);
  });

  it('has nothing to try before an offer came in', async () => {
    const { connection } = watch();

    await expect(connection.connectNow()).resolves.toEqual({ kind: 'unknown' });
  });

  it('never probes where the permission was refused, and leaves any route it had', async () => {
    const { client, connection, lan } = watch(OFFER, { permission: allowing('denied') });
    client.route.useDirect(LAN);

    connection.setSignedIn(true);
    await settle();

    expect(lan.fetch).not.toHaveBeenCalled();
    expect(client.route.direct()).toBeUndefined();
    expect(connection.state().askable).toBe(false);
  });

  it('drops the route and stops asking once signed out', async () => {
    const { client, connection, offersAsked } = watch(OFFER, { hosts: {} });
    connection.setSignedIn(true);
    await settle();
    client.route.useDirect(LAN);

    connection.setSignedIn(false);
    await vi.advanceTimersByTimeAsync(30 * MINUTE);

    expect(client.route.direct()).toBeUndefined();
    expect(offersAsked()).toBe(1);
  });

  it('asks again every few minutes while on the configured base', async () => {
    const { connection, offersAsked } = watch(OFFER, { hosts: {} });
    connection.setSignedIn(true);
    await settle();

    await vi.advanceTimersByTimeAsync(5 * MINUTE);

    expect(offersAsked()).toBe(2);
  });

  it('stops asking while the direct route holds, and starts again once it is dropped', async () => {
    const { client, connection, offersAsked } = watch();
    connection.setSignedIn(true);
    await settle();

    await vi.advanceTimersByTimeAsync(20 * MINUTE);
    const whileDirect = offersAsked();
    client.route.drop();
    await vi.advanceTimersByTimeAsync(5 * MINUTE);

    expect(whileDirect).toBe(1);
    expect(offersAsked()).toBe(2);
  });

  it('asks again on coming back after a while, and not after a glance away', async () => {
    const { connection, offersAsked } = watch(OFFER, { hosts: {} });
    connection.setSignedIn(true);
    await settle();

    connection.setForeground(false);
    await vi.advanceTimersByTimeAsync(10_000);
    connection.setForeground(true);
    await settle();
    const afterAGlance = offersAsked();
    connection.setForeground(false);
    await vi.advanceTimersByTimeAsync(MINUTE);
    connection.setForeground(true);
    await settle();

    expect(afterAGlance).toBe(1);
    expect(offersAsked()).toBe(2);
  });

  it('asks again when told the network is back, once at a time', async () => {
    const { connection, offersAsked } = watch(OFFER, { hosts: {} });
    connection.setSignedIn(true);
    await settle();

    connection.recheck();
    connection.recheck();
    await settle();

    expect(offersAsked()).toBe(2);
  });

  it('stops for good', async () => {
    const { connection, offersAsked } = watch(OFFER, { hosts: {} });
    connection.setSignedIn(true);
    await settle();

    connection.stop();
    connection.recheck();
    await vi.advanceTimersByTimeAsync(30 * MINUTE);

    expect(offersAsked()).toBe(1);
  });
});
