import { describe, expect, it } from 'vitest';
import { bandwidthPoints } from './bandwidth-points';
import type { VpnBandwidthView } from './schemas';

const TOTALS = {
  sealedDownBytes: 0,
  sealedUpBytes: 0,
  unsealedDownBytes: 0,
  unsealedUpBytes: 0,
  bypassDownBytes: 0,
  bypassUpBytes: 0,
  sealedSecs: 0,
  unsealedSecs: 0,
};

function view(series: Partial<VpnBandwidthView['series']>): VpnBandwidthView {
  return {
    range: '24h',
    startedAt: 1_000,
    stepSecs: 600,
    series: {
      sealedDown: [],
      sealedUp: [],
      unsealedDown: [],
      unsealedUp: [],
      bypassDown: [],
      bypassUp: [],
      unsealedSecs: [],
      ...series,
    },
    totals: TOTALS,
    bridgeConfigured: true,
  };
}

const secondsAt = (at: number) => String(at);

describe('bandwidthPoints', () => {
  it('names each bucket by the second it opens on', () => {
    const points = bandwidthPoints(view({ sealedDown: [1, 2, 3] }), 'down', secondsAt);

    expect(points.map((point) => point.at)).toEqual(['1000', '1600', '2200']);
  });

  it('reads the columns of the direction it was asked for', () => {
    const both = view({ sealedDown: [10], sealedUp: [4], unsealedUp: [6], bypassUp: [1] });

    const points = bandwidthPoints(both, 'up', secondsAt);

    expect(points).toEqual([{ at: '1000', sealed: 4, unsealed: 6, bypass: 1 }]);
  });

  it('reads a column the server sent short as zero so the bands stay aligned', () => {
    const ragged = view({ sealedDown: [10, 20], unsealedDown: [5] });

    const points = bandwidthPoints(ragged, 'down', secondsAt);

    expect(points).toEqual([
      { at: '1000', sealed: 10, unsealed: 5, bypass: 0 },
      { at: '1600', sealed: 20, unsealed: 0, bypass: 0 },
    ]);
  });

  it('draws nothing over a window with no buckets', () => {
    const points = bandwidthPoints(view({}), 'down', secondsAt);

    expect(points).toEqual([]);
  });
});
