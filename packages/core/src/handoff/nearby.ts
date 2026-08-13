// The phone's list, merged from every way it has of finding a TV.
//
// A TV that is both heard on the link and listed by the server is one row, not
// two, and the two copies are not equal: the server's row describes a beacon
// the server minted, while a link record is whatever a device on the wire chose
// to publish. So the server's row says what the row IS, and the heard one
// contributes only the proof that sends the grant down the stronger path.

import type { DiscoveredTv, TvDiscoverySource } from './sources';

export interface NearbyWatchOptions {
  /** Every way this device has of finding TVs. An empty list is a device that
   * cannot look, and reports nothing rather than failing. */
  sources: TvDiscoverySource[];
  onRows: (rows: DiscoveredTv[]) => void;
}

// A handle travels in the clear in the text record (see `beaconTxt`), so any
// device on the link can republish a real television's handle under a name of
// its own choosing. The server's copy is therefore the identity, a heard copy
// adds its proof and nothing else, and a second record of the same kind cannot
// take over a handle another has already claimed - "last one wins" would be an
// ordering an attacker picks.
function combine(seen: DiscoveredTv, row: DiscoveredTv): DiscoveredTv {
  if (seen.via === row.via) return seen;
  const listed = seen.via === 'server' ? seen : row;
  const heard = seen.via === 'server' ? row : seen;
  return { ...listed, via: 'lan', proof: heard.proof };
}

function merge(views: Map<string, DiscoveredTv[]>): DiscoveredTv[] {
  const byHandle = new Map<string, DiscoveredTv>();
  for (const rows of views.values()) {
    for (const row of rows) {
      const seen = byHandle.get(row.handle);
      byHandle.set(row.handle, seen ? combine(seen, row) : row);
    }
  }
  // Stable, so the list does not reshuffle under a thumb when one source
  // answers a beat after another.
  return [...byHandle.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.handle.localeCompare(b.handle),
  );
}

/**
 * Watch every source at once and report one merged list. Returns the stop
 * function, which stops all of them.
 *
 * Each source reports its whole view, never a delta, so a source going quiet
 * leaves its last view standing rather than blanking the list. That is
 * deliberate: a dropped poll is not a TV that went away, and a list that
 * flickers empty is worse than one a few seconds stale.
 */
export function watchNearbyTvs(opts: NearbyWatchOptions): () => void {
  const { sources, onRows } = opts;
  const views = new Map<string, DiscoveredTv[]>();
  let stopped = false;

  const stops = sources.map((source) =>
    source.start((rows) => {
      if (stopped) return;
      views.set(source.id, rows);
      onRows(merge(views));
    }),
  );

  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
