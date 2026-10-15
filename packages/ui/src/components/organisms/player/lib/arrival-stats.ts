import type { Arrival } from '@kromatv/core';
import type { Translate } from '@kromatv/i18n';
import type { PlayerStats } from '#ui/components/organisms/player/types';

export const THROUGHPUT_CHART = 'throughput';

export function withArrivalStats({
  base,
  arrival,
  t,
}: Readonly<{ base: PlayerStats; arrival: Arrival; t: Translate }>): PlayerStats {
  if (arrival.readings.length === 0) return base;
  const group = t('stats.groupDownload');
  const rate = arrival.rate;
  return {
    ...base,
    extra: [
      ...(base.extra ?? []),
      ...arrival.readings.map((reading) => ({ group, label: reading.label, value: reading.text })),
    ],
    meters: [
      ...(base.meters ?? []),
      ...(rate
        ? [
            {
              key: 'arrival',
              label: t('stats.incoming'),
              value: (rate.bps * 8) / 1000,
              display: rate.text,
              chart: THROUGHPUT_CHART,
            },
          ]
        : []),
    ],
  };
}
