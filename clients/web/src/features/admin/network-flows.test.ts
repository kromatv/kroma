import type { DeclaredPurpose } from '@kromatv/client/network';
import { describe, expect, it } from 'vitest';
import {
  callerChoices,
  FLOW_LIMIT,
  flowQuery,
  matchingHost,
  NO_FLOW_FILTERS,
  purposeChoices,
} from '#web/features/admin/network-flows';
import { flowOf as flow } from '#web/features/admin/network.fixture';

const PURPOSES: readonly DeclaredPurpose[] = [
  { caller: 'tv.kroma.torrents', purpose: 'trackers' },
  { caller: 'core', purpose: 'metadata' },
  { caller: 'tv.kroma.torrents', purpose: 'peers' },
];

describe('the journal request', () => {
  it('asks for the newest connections with no filter by default', () => {
    expect(flowQuery(NO_FLOW_FILTERS)).toEqual({ limit: FLOW_LIMIT });
  });

  it('hands the caller, the purpose and the verdict to the server', () => {
    const filters = {
      caller: 'core',
      purpose: 'metadata',
      verdict: 'blocked',
      host: 'tmdb',
    } as const;

    expect(flowQuery(filters)).toEqual({
      limit: FLOW_LIMIT,
      caller: 'core',
      purpose: 'metadata',
      verdict: 'blocked',
    });
  });
});

describe('the host search', () => {
  const flows = [
    flow({ id: 'a', host: 'api.themoviedb.org' }),
    flow({ id: 'b', host: 'tracker.opentrackr.org', port: 1337 }),
  ];

  it('keeps the connections whose host holds the text, whatever its case', () => {
    expect(matchingHost(flows, ' TRACKR ').map((one) => one.id)).toEqual(['b']);
  });

  it('matches the port written after the host', () => {
    expect(matchingHost(flows, 'org:1337').map((one) => one.id)).toEqual(['b']);
  });

  it('keeps every connection while the search is empty', () => {
    expect(matchingHost(flows, '')).toBe(flows);
  });
});

describe('the caller filter', () => {
  it('offers the server first, then every module once, from declarations and traffic', () => {
    const flows = [flow({ caller: 'tv.kroma.vpn' })];

    expect(callerChoices(PURPOSES, flows, null)).toEqual([
      'core',
      'tv.kroma.torrents',
      'tv.kroma.vpn',
    ]);
  });

  it('keeps offering the picked caller after its traffic is gone', () => {
    expect(callerChoices([], [], 'tv.kroma.whisper')).toEqual(['tv.kroma.whisper']);
  });
});

describe('the purpose filter', () => {
  it('offers only what the picked caller declared or used', () => {
    const flows = [flow({ caller: 'tv.kroma.torrents', purpose: 'dht' })];

    expect(purposeChoices(PURPOSES, flows, 'tv.kroma.torrents', null)).toEqual([
      'dht',
      'peers',
      'trackers',
    ]);
  });

  it('offers every purpose while no caller is picked', () => {
    expect(purposeChoices(PURPOSES, [], null, null)).toEqual(['metadata', 'peers', 'trackers']);
  });

  it('keeps offering the picked purpose', () => {
    expect(purposeChoices([], [], null, 'updates')).toEqual(['updates']);
  });
});
