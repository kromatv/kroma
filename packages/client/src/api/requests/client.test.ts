import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { IndexerId, RequestId } from './ids';

const request = RequestId.parse('r1');
const CREATE = { kind: 'movie' as const, tmdbId: 603, seasons: null };
const COVERAGE = { seasons: [1, 2], episodes: null };
const GRAB = { guid: 'rel-1', indexerId: IndexerId.parse('idx1'), scope: 'all' as const };

describe('the request endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.requests.list(), method: 'GET', path: '/requests' },
    {
      name: 'list narrowed to the caller',
      call: (c) => c.requests.list({ mine: true }),
      method: 'GET',
      path: '/requests?mine=true',
    },
    {
      name: 'calendar',
      call: (c) => c.requests.calendar(),
      method: 'GET',
      path: '/requests/calendar',
    },
    {
      name: 'missing',
      call: (c) => c.requests.missing({ mine: true }),
      method: 'GET',
      path: '/requests/missing?mine=true',
    },
    {
      name: 'searchAllMissing',
      call: (c) => c.requests.searchAllMissing(),
      method: 'POST',
      path: '/requests/search-missing',
    },
    {
      name: 'autoSearch',
      call: (c) => c.requests.autoSearch(request),
      method: 'POST',
      path: '/requests/r1/auto-search',
    },
    {
      name: 'create',
      call: (c) => c.requests.create(CREATE),
      method: 'POST',
      path: '/requests',
      body: CREATE,
    },
    {
      name: 'delete',
      call: (c) => c.requests.delete(request),
      method: 'DELETE',
      path: '/requests/r1',
    },
    {
      name: 'approve',
      call: (c) => c.requests.approve(request),
      method: 'POST',
      path: '/requests/r1/approve',
    },
    {
      name: 'deny with a reason the requester sees',
      call: (c) => c.requests.deny(request, 'nope'),
      method: 'POST',
      path: '/requests/r1/deny',
      body: { note: 'nope' },
    },
    {
      name: 'deny without one',
      call: (c) => c.requests.deny(request),
      method: 'POST',
      path: '/requests/r1/deny',
      body: {},
    },
    {
      name: 'wanted',
      call: (c) => c.requests.wanted(request),
      method: 'GET',
      path: '/requests/r1/wanted',
    },
    {
      name: 'setCoverage',
      call: (c) => c.requests.setCoverage(request, COVERAGE),
      method: 'PUT',
      path: '/requests/r1/coverage',
      body: COVERAGE,
    },
    {
      name: 'ledger',
      call: (c) => c.requests.ledger(request),
      method: 'GET',
      path: '/requests/r1/ledger',
    },
    {
      name: 'seasonLedger',
      call: (c) => c.requests.seasonLedger(request, 2),
      method: 'GET',
      path: '/requests/r1/ledger/2',
    },
    {
      name: 'searchReleases over the whole request by default',
      call: (c) => c.requests.searchReleases(request),
      method: 'GET',
      path: '/requests/r1/search?scope=all',
    },
    {
      name: 'searchReleases narrowed to one episode',
      call: (c) => c.requests.searchReleases(request, { scope: 'episode', season: 3, episode: 7 }),
      method: 'GET',
      path: '/requests/r1/search?scope=episode&season=3&episode=7',
    },
    {
      name: 'grab',
      call: (c) => c.requests.grab(request, GRAB),
      method: 'POST',
      path: '/requests/r1/grab',
      body: GRAB,
    },
  ])('$name', checkEndpoint);
});
