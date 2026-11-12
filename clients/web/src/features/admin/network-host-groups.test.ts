import { describe, expect, it } from 'vitest';
import { groupByHost } from '#web/features/admin/network-host-groups';
import { summaryRowOf as row } from '#web/features/admin/network.fixture';

describe('the destinations grouped by host', () => {
  it('adds up every group that reached the same host', () => {
    const [tmdb] = groupByHost([
      row({ purpose: 'metadata', count: 10, bytesIn: 1000, bytesOut: 100, lastAt: 1_000 }),
      row({ purpose: 'artwork', count: 5, bytesIn: 4000, bytesOut: 50, lastAt: 3_000 }),
    ]);

    expect(tmdb).toEqual({
      host: 'api.themoviedb.org',
      callers: ['core'],
      purposes: ['artwork', 'metadata'],
      routes: ['direct'],
      count: 15,
      blocked: 0,
      bytesIn: 5000,
      bytesOut: 150,
      lastAt: 3_000,
    });
  });

  it('names each caller and each road once, the roads in the order direct, vpn, blocked', () => {
    const [tracker] = groupByHost([
      row({
        host: 'tracker.example',
        caller: 'tv.kroma.torrents',
        route: 'blocked',
        verdict: 'blocked',
      }),
      row({ host: 'tracker.example', caller: 'tv.kroma.indexer', route: 'vpn' }),
      row({ host: 'tracker.example', caller: 'tv.kroma.torrents', route: 'vpn' }),
    ]);

    expect(tracker?.callers).toEqual(['tv.kroma.indexer', 'tv.kroma.torrents']);
    expect(tracker?.routes).toEqual(['vpn', 'blocked']);
  });

  it('counts the refused connections apart', () => {
    const [tracker] = groupByHost([
      row({ host: 'tracker.example', verdict: 'blocked', route: 'blocked', count: 4 }),
      row({ host: 'tracker.example', count: 6 }),
    ]);

    expect(tracker).toMatchObject({ count: 10, blocked: 4 });
  });

  it('puts the busiest host first and breaks a tie by name', () => {
    const hosts = groupByHost([
      row({ host: 'b.example', count: 3 }),
      row({ host: 'c.example', count: 9 }),
      row({ host: 'a.example', count: 3 }),
    ]).map((group) => group.host);

    expect(hosts).toEqual(['c.example', 'a.example', 'b.example']);
  });
});
