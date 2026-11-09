import { recordingClient } from '@kromatv/client/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectDirect } from './connect-direct';
import { CANONICAL, clientOffering, LAN, network, OFFER } from './direct.fixture';

const OUR_SERVER = { instanceId: 'srv-1', proofs: { n1: 'a1' } };

afterEach(() => {
  vi.useRealTimers();
});

describe('connectDirect', () => {
  it('takes the route that is this server and answers its challenge', async () => {
    const { client } = clientOffering(OFFER);
    const { fetch } = network({ [LAN]: OUR_SERVER });

    const outcome = await connectDirect(client, { fetch });

    expect(outcome).toEqual({ kind: 'direct', route: LAN });
    expect(client.route.api()).toBe(LAN);
  });

  it('asks for the offer on the configured base and probes without the bearer', async () => {
    const { client, calls } = clientOffering(OFFER);
    const { fetch, seen } = network({ [LAN]: OUR_SERVER });

    await connectDirect(client, { fetch });

    expect(calls.map((call) => call.url)).toEqual([`${CANONICAL}/api/server/direct`]);
    expect(seen.map((probe) => probe.url)).toEqual([
      `${LAN}/api/health`,
      `${LAN}/api/server/direct/proof?nonce=n1`,
    ]);
    expect(seen.every((probe) => !probe.headers.has('Authorization'))).toBe(true);
  });

  it('never probes an address that is not a private http one', async () => {
    const { client } = clientOffering({
      ...OFFER,
      routes: ['http://203.0.113.7:4040', 'https://192.168.1.2:4443', 'http://kroma.local:4040'],
    });
    const { fetch } = network({});

    const outcome = await connectDirect(client, { fetch });

    expect(outcome).toEqual({ kind: 'canonical', reason: 'no-route' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes over a host that is another server', async () => {
    const { client } = clientOffering(OFFER);
    const { fetch } = network({ [LAN]: { instanceId: 'someone-else', proofs: { n1: 'a1' } } });

    const outcome = await connectDirect(client, { fetch });

    expect(outcome).toEqual({ kind: 'canonical', reason: 'unreachable' });
    expect(client.route.direct()).toBeUndefined();
  });

  it('refuses a host that wears the server instance but cannot answer the challenge', async () => {
    const { client } = clientOffering(OFFER);
    const { fetch } = network({ [LAN]: { instanceId: 'srv-1', proofs: { n1: 'a guess' } } });

    const outcome = await connectDirect(client, { fetch });

    expect(outcome).toEqual({ kind: 'canonical', reason: 'unproven' });
    expect(client.route.direct()).toBeUndefined();
  });

  it('refuses a host that does not answer the challenge at all', async () => {
    const { client } = clientOffering(OFFER);
    const { fetch } = network({ [LAN]: { instanceId: 'srv-1' } });

    const outcome = await connectDirect(client, { fetch });

    expect(outcome).toEqual({ kind: 'canonical', reason: 'unproven' });
  });

  it('takes whichever of several routes answers', async () => {
    const other = 'http://10.0.0.4:4040';
    const { client } = clientOffering({ ...OFFER, routes: [other, LAN] });
    const { fetch } = network({ [LAN]: OUR_SERVER });

    const outcome = await connectDirect(client, { fetch });

    expect(outcome).toEqual({ kind: 'direct', route: LAN });
  });

  it('gives up on a route that does not answer in time', async () => {
    vi.useFakeTimers();
    const { client } = clientOffering(OFFER);
    const { fetch } = network({ [LAN]: { hangs: true } });

    const pending = connectDirect(client, { fetch, timeoutMs: 1500 });
    await vi.advanceTimersByTimeAsync(1500);

    await expect(pending).resolves.toEqual({ kind: 'canonical', reason: 'unreachable' });
  });

  it('drops the route in use once the server offers none', async () => {
    const { client } = clientOffering({ ...OFFER, routes: [] });
    client.route.useDirect(LAN);

    const outcome = await connectDirect(client, { fetch: network({}).fetch });

    expect(outcome).toEqual({ kind: 'canonical', reason: 'no-route' });
    expect(client.route.direct()).toBeUndefined();
  });

  it('keeps the route in use when the offer cannot be asked', async () => {
    const { client } = clientOffering();
    client.route.useDirect(LAN);

    const outcome = await connectDirect(client, { fetch: network({}).fetch });

    expect(outcome).toEqual({ kind: 'unknown' });
    expect(client.route.direct()).toBe(LAN);
  });

  it('leaves a client already configured on its own network alone', async () => {
    const { client, calls } = recordingClient(undefined, { baseUrl: 'http://kroma.local:4040' });

    const outcome = await connectDirect(client, { fetch: network({}).fetch });

    expect(outcome).toEqual({ kind: 'canonical', reason: 'no-route' });
    expect(calls).toHaveLength(0);
  });

  it('probes an older offer at once and proves the route with a fresh challenge', async () => {
    const { client } = clientOffering({ ...OFFER, nonce: 'n2', answer: 'a2' });
    const { fetch, seen } = network({ [LAN]: { instanceId: 'srv-1', proofs: { n2: 'a2' } } });

    const outcome = await connectDirect(client, { fetch, routesFrom: OFFER });

    expect(outcome).toEqual({ kind: 'direct', route: LAN });
    expect(seen.at(-1)?.url).toBe(`${LAN}/api/server/direct/proof?nonce=n2`);
  });

  it('uses an offer it is handed without asking for another', async () => {
    const { client, calls } = clientOffering(OFFER);
    const { fetch } = network({ [LAN]: OUR_SERVER });

    await connectDirect(client, { fetch, offer: OFFER });

    expect(calls).toHaveLength(0);
  });
});
