import type { DeclaredPurpose } from '@kromatv/client/network';
import { describe, expect, it } from 'vitest';
import {
  callerChoices,
  FIRST_FLOW_PAGE,
  FLOW_PAGE_SIZE,
  flowPageCount,
  flowPositionAt,
  flowQuery,
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
  it('asks for the newest page with no filter by default', () => {
    expect(flowQuery(NO_FLOW_FILTERS, FIRST_FLOW_PAGE)).toEqual({ limit: FLOW_PAGE_SIZE });
  });

  it('hands every filter to the server, the host search included', () => {
    const filters = {
      caller: 'core',
      purpose: 'metadata',
      verdict: 'blocked',
      host: ' tmdb ',
    } as const;

    expect(flowQuery(filters, FIRST_FLOW_PAGE)).toEqual({
      limit: FLOW_PAGE_SIZE,
      caller: 'core',
      purpose: 'metadata',
      verdict: 'blocked',
      host: 'tmdb',
    });
  });

  it('asks past the first page from the id the pages were anchored on', () => {
    expect(flowQuery(NO_FLOW_FILTERS, { page: 3, before: 4183 })).toEqual({
      limit: FLOW_PAGE_SIZE,
      offset: 2 * FLOW_PAGE_SIZE,
      before: 4183,
    });
  });
});

describe('moving through the pages', () => {
  const shown = [flow({ id: 4182 }), flow({ id: 4181 })];

  it('anchors on the newest connection on screen when leaving the first page', () => {
    expect(flowPositionAt(2, FIRST_FLOW_PAGE, shown)).toEqual({ page: 2, before: 4183 });
  });

  it('keeps its anchor from one page to the next', () => {
    expect(flowPositionAt(3, { page: 2, before: 900 }, shown)).toEqual({ page: 3, before: 900 });
  });

  it('goes live again back on the first page', () => {
    expect(flowPositionAt(1, { page: 3, before: 900 }, shown)).toEqual(FIRST_FLOW_PAGE);
  });

  it('counts the pages a total fills, and at least one', () => {
    expect(flowPageCount(0)).toBe(1);
    expect(flowPageCount(FLOW_PAGE_SIZE)).toBe(1);
    expect(flowPageCount(FLOW_PAGE_SIZE + 1)).toBe(2);
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
