import { useFormat, useLocale, useT } from '@kroma/module-sdk';
import { Box, Chart } from '@kroma/ui/kit';
import { useMemo } from 'react';
import { type BandwidthDirection, bandwidthPoints } from './bandwidth-points';
import type { VpnBandwidthView } from './schemas';

const HEIGHT = 208;

const BAND = { sealed: 'success', unsealed: 'danger', bypass: 'glyphDim' } as const;

export function BandwidthChart({
  view,
  direction,
}: Readonly<{ view: VpnBandwidthView; direction: BandwidthDirection }>) {
  const t = useT();
  const fmt = useFormat();
  const nameAt = useBucketName();
  const points = useMemo(() => bandwidthPoints(view, direction, nameAt), [view, direction, nameAt]);
  const sealed = direction === 'down' ? view.totals.sealedDownBytes : view.totals.sealedUpBytes;
  return (
    <Box mt={12}>
      <Chart.Root
        data={points}
        x="at"
        height={HEIGHT}
        format={fmt.bytes}
        label={t('vpnBandwidth.title')}
      >
        <Chart.Grid />
        <Chart.Bar series="sealed" label={t('vpnBandwidth.inTunnel')} color={BAND.sealed} />
        <Chart.Bar
          series="unsealed"
          label={t('vpnBandwidth.outsideTunnel')}
          color={BAND.unsealed}
          stack
        />
        <Chart.Bar
          series="bypass"
          label={t('vpnBandwidth.otherClient')}
          color={BAND.bypass}
          stack
        />
        <Chart.Axis edge="left" />
        <Chart.Axis edge="bottom" />
        <Chart.Tooltip />
        <Chart.Legend />
        <Chart.Footer>{t('vpnBandwidth.throughTunnel', { total: fmt.bytes(sealed) })}</Chart.Footer>
      </Chart.Root>
    </Box>
  );
}

function useBucketName(): (atSec: number) => string {
  const locale = useLocale();
  return useMemo(() => {
    const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    const day = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' });
    return (atSec: number) => {
      const at = new Date(atSec * 1000);
      return `${day.format(at)} ${clock.format(at)}`;
    };
  }, [locale]);
}
