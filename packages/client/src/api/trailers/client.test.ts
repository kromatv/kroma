import { describe, expect, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { ticketedClient } from '../../kroma-client.fixture';

describe('the trailer endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'list',
      call: (c) => c.trailers.list('movie', 1061474),
      method: 'GET',
      path: '/trailers/movie/1061474',
    },
    {
      name: 'prepare',
      call: (c) => c.trailers.prepare('tv', 1399, 'KPLWWIOCOOQ'),
      method: 'POST',
      path: '/trailers/tv/1399/KPLWWIOCOOQ/prepare',
    },
  ])('$name', checkEndpoint);
});

describe('the trailer a player fetches for itself', () => {
  it('carries the account media ticket', async () => {
    const client = await ticketedClient();

    const url = client.trailers.streamUrl('movie', 1061474, 'qu5n7RALVpE');

    expect(url).toBe(
      'http://kroma.test/api/trailers/movie/1061474/qu5n7RALVpE/stream?t=dev.999.sig',
    );
  });
});
