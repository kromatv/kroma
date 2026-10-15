import { arrivalOf } from '@kromatv/core';
import type { Locale, Translate } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import type { PlayerStats } from '#ui/components/organisms/player/types';
import { sampleArrival, sampleSource } from '#ui/lib/sample-arrival';
import { THROUGHPUT_CHART, withArrivalStats } from './arrival-stats';

const t = ((key: string) => key) as unknown as Translate;
const locale: Locale = 'en';

const BASE: PlayerStats = {
  mode: 'HLS · copy',
  extra: [{ label: 'stats.container', value: 'MKV' }],
  meters: [
    {
      key: 'bandwidth',
      label: 'stats.bandwidth',
      value: 8_400,
      display: '8.40 Mb/s',
      chart: THROUGHPUT_CHART,
    },
  ],
};

const NOTHING_YET = arrivalOf({ source: sampleSource, progress: null, t, locale });
const ARRIVED = arrivalOf({ source: sampleSource, progress: sampleArrival(34), t, locale });

describe('what a player reports about a file still arriving', () => {
  it('hands back the surface snapshot untouched before the source has reported anything', () => {
    const snapshot = withArrivalStats({ base: BASE, arrival: NOTHING_YET, t });

    expect(snapshot).toBe(BASE);
  });

  it("keeps the rows the surface reported and groups the source's own under the download", () => {
    const snapshot = withArrivalStats({ base: BASE, arrival: ARRIVED, t });

    expect(snapshot.extra?.[0]).toEqual({ label: 'stats.container', value: 'MKV' });
    expect(snapshot.extra?.slice(1).map((row) => row.group)).toEqual([
      'stats.groupDownload',
      'stats.groupDownload',
      'stats.groupDownload',
    ]);
  });

  it("names every row in the source's own words rather than the catalog's", () => {
    const snapshot = withArrivalStats({ base: BASE, arrival: ARRIVED, t });

    expect(snapshot.extra?.slice(1).map((row) => row.label)).toEqual([
      'Téléchargé',
      'Vitesse',
      'Pairs',
    ]);
  });

  it('charts the declared rate in kilobits beside the throughput the surface reports', () => {
    const snapshot = withArrivalStats({ base: BASE, arrival: ARRIVED, t });

    expect(snapshot.meters?.at(-1)).toMatchObject({
      key: 'arrival',
      value: 2_544,
      chart: THROUGHPUT_CHART,
    });
  });
});
