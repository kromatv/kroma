import { describe, expect, it } from 'vitest';
import type { VpnBandwidthView } from './schemas';
import { bypassedBytes, sealNote } from './seal-note';

const EMPTY_SERIES = {
  sealedDown: [],
  sealedUp: [],
  unsealedDown: [],
  unsealedUp: [],
  bypassDown: [],
  bypassUp: [],
  unsealedSecs: [],
};

const EMPTY_TOTALS = {
  sealedDownBytes: 0,
  sealedUpBytes: 0,
  unsealedDownBytes: 0,
  unsealedUpBytes: 0,
  bypassDownBytes: 0,
  bypassUpBytes: 0,
  sealedSecs: 0,
  unsealedSecs: 0,
};

function view(totals: Partial<typeof EMPTY_TOTALS>, bridgeConfigured = true): VpnBandwidthView {
  return {
    range: '24h',
    startedAt: 0,
    stepSecs: 600,
    series: EMPTY_SERIES,
    totals: { ...EMPTY_TOTALS, ...totals },
    bridgeConfigured,
  };
}

describe('sealNote', () => {
  it('says there is no bridge before it says anything about a seal', () => {
    const note = sealNote(view({ unsealedDownBytes: 4096, unsealedSecs: 60 }, false));

    expect(note).toEqual({ kind: 'noBridge' });
  });

  it('reports the bytes that moved outside the tunnel over a gap in it', () => {
    const note = sealNote(view({ unsealedDownBytes: 4000, unsealedUpBytes: 96, unsealedSecs: 60 }));

    expect(note).toEqual({ kind: 'leaked', bytes: 4096 });
  });

  it('reports a bridge that was down even when nothing moved through it', () => {
    const note = sealNote(view({ sealedSecs: 3540, unsealedSecs: 60 }));

    expect(note).toEqual({ kind: 'gap', secs: 60 });
  });

  it('calls a window sealed only when nothing left the tunnel and it never dropped', () => {
    const note = sealNote(view({ sealedDownBytes: 9_000_000, sealedSecs: 3600 }));

    expect(note).toEqual({ kind: 'sealed' });
  });
});

describe('bypassedBytes', () => {
  it('adds up what an external client moved, which the bridge never carried', () => {
    const bytes = bypassedBytes(view({ bypassDownBytes: 700, bypassUpBytes: 300 }));

    expect(bytes).toBe(1000);
  });
});
