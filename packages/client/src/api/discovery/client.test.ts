import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';

describe('the discovery endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'search',
      call: (c) => c.discovery.search('dune', { type: 'movie', page: 2 }),
      method: 'GET',
      path: '/discover/search?q=dune&type=movie&page=2',
    },
    {
      name: 'search drops the all filter and page one',
      call: (c) => c.discovery.search('dune', { type: 'all', page: 1 }),
      method: 'GET',
      path: '/discover/search?q=dune',
    },
    {
      name: 'trending',
      call: (c) => c.discovery.trending(),
      method: 'GET',
      path: '/discover/trending',
    },
    {
      name: 'detail',
      call: (c) => c.discovery.detail('tv', 1399),
      method: 'GET',
      path: '/discover/tv/1399',
    },
  ])('$name', checkEndpoint);
});
