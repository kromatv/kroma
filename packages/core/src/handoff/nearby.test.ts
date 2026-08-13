// Merging what several ways of looking each found. The question this answers:
// one television, found twice, is one row - the server's account of it, carrying
// the proof of the copy that was heard. Including whether granting it costs the
// person a code, which a record on the link may not answer for.

import { describe, expect, it, vi } from 'vitest';
import { watchNearbyTvs } from './nearby';
import type { DiscoveredTv, TvDiscoverySource } from './sources';

function row(handle: string, name: string, via: 'lan' | 'server'): DiscoveredTv {
  return {
    handle,
    name,
    platform: 'tvOS',
    check: 'K7QMR',
    // What a placeable television looks like: the server listed it and asked
    // for nothing more. Each test below that cares says so for itself.
    confirmRequired: false,
    via,
    ...(via === 'lan' ? { proof: `proof-${handle}` } : {}),
  };
}

// A source a test drives by hand, so a merge can be watched one report at a time.
function manual(id: string) {
  let publish: ((rows: DiscoveredTv[]) => void) | undefined;
  const stop = vi.fn();
  const source: TvDiscoverySource = {
    id,
    start(onRows) {
      publish = onRows;
      return stop;
    },
  };
  return { source, stop, report: (rows: DiscoveredTv[]) => publish?.(rows) };
}

describe('merging what each source found', () => {
  it('reports one row for a television found by both, carrying the proof it heard', () => {
    const server = manual('server');
    const lan = manual('lan');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source, lan.source], onRows: (r) => seen.push(r) });

    server.report([row('h1', 'Salon', 'server')]);
    lan.report([row('h1', 'Salon', 'lan')]);

    const merged = seen.at(-1);
    expect(merged).toHaveLength(1);
    expect(merged?.[0]?.via).toBe('lan');
    expect(merged?.[0]?.proof).toBe('proof-h1');
  });

  it('keeps the heard copy whichever source reported first', () => {
    const lan = manual('lan');
    const server = manual('server');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [lan.source, server.source], onRows: (r) => seen.push(r) });

    lan.report([row('h1', 'Salon', 'lan')]);
    server.report([row('h1', 'Salon', 'server')]);

    expect(seen.at(-1)?.[0]?.via).toBe('lan');
  });

  it('does not let a record on the link rename a television the server listed', () => {
    const server = manual('server');
    const lan = manual('lan');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source, lan.source], onRows: (r) => seen.push(r) });

    server.report([row('h1', 'Salon', 'server')]);
    // The handle is published in the clear, so anything on the link can quote
    // it back under a name, a platform and a check string of its own.
    lan.report([{ ...row('h1', 'Cuisine', 'lan'), platform: 'Android TV', check: 'ZZZZ' }]);

    const merged = seen.at(-1);
    expect(merged).toHaveLength(1);
    expect(merged?.[0]?.name).toBe('Salon');
    expect(merged?.[0]?.platform).toBe('tvOS');
    expect(merged?.[0]?.check).toBe('K7QMR');
    // The one thing the heard copy is believed about.
    expect(merged?.[0]?.proof).toBe('proof-h1');
  });

  it('keeps the listed identity whichever source reported first', () => {
    const lan = manual('lan');
    const server = manual('server');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [lan.source, server.source], onRows: (r) => seen.push(r) });

    lan.report([row('h1', 'Cuisine', 'lan')]);
    server.report([row('h1', 'Salon', 'server')]);

    expect(seen.at(-1)?.[0]?.name).toBe('Salon');
    expect(seen.at(-1)?.[0]?.proof).toBe('proof-h1');
  });

  it('does not let one record on the link take a handle another already claimed', () => {
    const lan = manual('lan');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [lan.source], onRows: (r) => seen.push(r) });

    // Nothing here can tell which of the two is the television, so the order
    // the browse happened to emit them in must not be what decides.
    lan.report([row('h1', 'Salon', 'lan'), { ...row('h1', 'Cuisine', 'lan'), proof: 'forged' }]);

    const merged = seen.at(-1);
    expect(merged).toHaveLength(1);
    expect(merged?.[0]?.name).toBe('Salon');
    expect(merged?.[0]?.proof).toBe('proof-h1');
  });

  it('takes whether a code is needed from the server, not from the link', () => {
    const server = manual('server');
    const lan = manual('lan');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source, lan.source], onRows: (r) => seen.push(r) });

    server.report([{ ...row('h1', 'Salon', 'server'), confirmRequired: true }]);
    // A forged record for a real handle, saying the confirmation may be skipped.
    // Nothing in the text record is evidence of anything about the beacon, and
    // this field in particular is the server's answer to whether it could place
    // the origin that raised it.
    lan.report([{ ...row('h1', 'Salon', 'lan'), confirmRequired: false }]);

    expect(seen.at(-1)?.[0]?.confirmRequired).toBe(true);
    expect(seen.at(-1)?.[0]?.proof).toBe('proof-h1');
  });

  it('takes it from the server whichever source reported first', () => {
    const lan = manual('lan');
    const server = manual('server');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [lan.source, server.source], onRows: (r) => seen.push(r) });

    lan.report([{ ...row('h1', 'Salon', 'lan'), confirmRequired: false }]);
    server.report([{ ...row('h1', 'Salon', 'server'), confirmRequired: true }]);

    expect(seen.at(-1)?.[0]?.confirmRequired).toBe(true);
  });

  it('lets the server wave the code away, since it is the one that placed the TV', () => {
    const server = manual('server');
    const lan = manual('lan');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source, lan.source], onRows: (r) => seen.push(r) });

    server.report([{ ...row('h1', 'Salon', 'server'), confirmRequired: false }]);
    lan.report([{ ...row('h1', 'Salon', 'lan'), confirmRequired: true }]);

    expect(seen.at(-1)?.[0]?.confirmRequired).toBe(false);
  });

  it('leaves a television only the link found to the server rather than guessing', () => {
    // No server row is no answer, not a "yes": the grant is where the answer
    // arrives, and a beacon that wants its check is refused without one.
    // Guessing here asked for a code on every television that needed none.
    const lan = manual('lan');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [lan.source], onRows: (r) => seen.push(r) });

    lan.report([{ ...row('h1', 'Salon', 'lan'), confirmRequired: false }]);

    expect(seen.at(-1)?.[0]?.confirmRequired).toBe(false);
  });

  it('carries every television only one source could find', () => {
    const server = manual('server');
    const lan = manual('lan');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source, lan.source], onRows: (r) => seen.push(r) });

    server.report([row('h1', 'Salon', 'server')]);
    lan.report([row('h2', 'Chambre', 'lan')]);

    expect(seen.at(-1)?.map((r) => r.name)).toEqual(['Chambre', 'Salon']);
  });

  it('sorts by name so the list does not reshuffle under a thumb', () => {
    const server = manual('server');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source], onRows: (r) => seen.push(r) });

    server.report([
      row('h3', 'Salon', 'server'),
      row('h1', 'Bureau', 'server'),
      row('h2', 'Chambre', 'server'),
    ]);
    expect(seen.at(-1)?.map((r) => r.name)).toEqual(['Bureau', 'Chambre', 'Salon']);
  });

  it('breaks a tie on name by handle, so two TVs of one name hold their order', () => {
    const server = manual('server');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source], onRows: (r) => seen.push(r) });

    server.report([row('hb', 'Apple TV', 'server'), row('ha', 'Apple TV', 'server')]);
    expect(seen.at(-1)?.map((r) => r.handle)).toEqual(['ha', 'hb']);
  });

  it('leaves a quiet source s last view standing', () => {
    const server = manual('server');
    const lan = manual('lan');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source, lan.source], onRows: (r) => seen.push(r) });

    lan.report([row('h2', 'Chambre', 'lan')]);
    server.report([row('h1', 'Salon', 'server')]);
    // The link goes quiet; the server speaks again. Chambre is still there.
    server.report([row('h1', 'Salon', 'server'), row('h3', 'Bureau', 'server')]);

    expect(seen.at(-1)?.map((r) => r.name)).toEqual(['Bureau', 'Chambre', 'Salon']);
  });

  it('takes a source that empties as a source that found nothing', () => {
    const server = manual('server');
    const seen: DiscoveredTv[][] = [];
    watchNearbyTvs({ sources: [server.source], onRows: (r) => seen.push(r) });

    server.report([row('h1', 'Salon', 'server')]);
    server.report([]);
    expect(seen.at(-1)).toEqual([]);
  });
});

describe('standing down', () => {
  it('stops every source', () => {
    const server = manual('server');
    const lan = manual('lan');
    const stop = watchNearbyTvs({ sources: [server.source, lan.source], onRows: () => undefined });

    stop();
    expect(server.stop).toHaveBeenCalled();
    expect(lan.stop).toHaveBeenCalled();
  });

  it('reports nothing from a source that answers after the stop', () => {
    const server = manual('server');
    const seen: DiscoveredTv[][] = [];
    const stop = watchNearbyTvs({ sources: [server.source], onRows: (r) => seen.push(r) });

    stop();
    server.report([row('h1', 'Salon', 'server')]);
    expect(seen).toEqual([]);
  });

  it('reports nothing at all on a device with no way to look', () => {
    const seen: DiscoveredTv[][] = [];
    const stop = watchNearbyTvs({ sources: [], onRows: (r) => seen.push(r) });
    expect(seen).toEqual([]);
    expect(() => stop()).not.toThrow();
  });
});
