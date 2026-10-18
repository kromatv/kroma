import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';

describe('the monitoring endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.monitoring.list(), method: 'GET', path: '/monitoring' },
    {
      name: 'library',
      call: (c) => c.monitoring.library(),
      method: 'GET',
      path: '/monitoring/library',
    },
    {
      name: 'get',
      call: (c) => c.monitoring.get('show', 77),
      method: 'GET',
      path: '/monitoring/show/77',
    },
    {
      name: 'monitor',
      call: (c) => c.monitoring.monitor('show', 77, { preset: 'missing' }),
      method: 'PUT',
      path: '/monitoring/show/77',
      body: { preset: 'missing' },
    },
    {
      name: 'unmonitor',
      call: (c) => c.monitoring.unmonitor('movie', 603),
      method: 'DELETE',
      path: '/monitoring/movie/603',
    },
    {
      name: 'search',
      call: (c) => c.monitoring.search('show', 77, [{ season: 1, episode: 3 }]),
      method: 'POST',
      path: '/monitoring/show/77/search',
      body: { units: [{ season: 1, episode: 3 }] },
    },
    {
      name: 'setEpisodes',
      call: (c) => c.monitoring.setEpisodes(77, { seasons: [{ season: 2, monitored: false }] }),
      method: 'PUT',
      path: '/monitoring/show/77/episodes',
      body: { seasons: [{ season: 2, monitored: false }] },
    },
    {
      name: 'bulk',
      call: (c) => c.monitoring.bulk([{ kind: 'movie', tmdbId: 603 }], { preset: 'all' }),
      method: 'POST',
      path: '/monitoring/bulk',
      body: { titles: [{ kind: 'movie', tmdbId: 603 }], preset: 'all' },
    },
    {
      name: 'ledger',
      call: (c) => c.monitoring.ledger('show', 77),
      method: 'GET',
      path: '/monitoring/show/77/ledger',
    },
    {
      name: 'seasonLedger',
      call: (c) => c.monitoring.seasonLedger(77, 2),
      method: 'GET',
      path: '/monitoring/show/77/ledger/2',
    },
  ])('$name', checkEndpoint);
});
