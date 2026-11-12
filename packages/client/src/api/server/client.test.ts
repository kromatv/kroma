import { describe, expect, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { recordingClient } from '../../kroma-client.fixture';

const OFFER = {
  instanceId: 'srv-1',
  routes: ['http://192.168.1.2:4040'],
  nonce: 'n',
  answer: 'a',
  sameNetwork: true,
};

describe('the server endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'direct',
      call: (c) => c.server.direct(),
      method: 'GET',
      path: '/server/direct',
    },
  ])('$name', checkEndpoint);

  it('asks for the direct route on the configured base while a direct route is in use', async () => {
    const { client, calls } = recordingClient(() => ({ json: OFFER }));
    client.route.useDirect('http://192.168.1.2:4040');

    const offer = await client.server.direct();

    expect(calls[0]?.url).toBe('http://kroma.test/api/server/direct');
    expect(offer).toEqual(OFFER);
  });
});
