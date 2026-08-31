import { ModuleFailed, ModuleLoading, usePoll, useT } from '@kroma/module-sdk';
import { EmptyState, Row, Section, Select } from '@kroma/ui/kit';
import { useState } from 'react';
import { useVpnApi } from './api';
import { BandwidthChart } from './bandwidth-chart';
import type { BandwidthDirection } from './bandwidth-points';
import type { VpnBandwidthRange, VpnBandwidthView } from './schemas';
import { SealBanner } from './seal-banner';

const POLL_MS = 60000;

const RANGES = ['12h', '24h', '7d', '30d', '90d', '1y', 'all'] as const satisfies readonly [
  VpnBandwidthRange,
  ...VpnBandwidthRange[],
];

const RANGE_LABEL = {
  '12h': 'admin.range12h',
  '24h': 'admin.range24h',
  '7d': 'admin.range7d',
  '30d': 'admin.range30d',
  '90d': 'admin.range90d',
  '1y': 'admin.range1y',
  all: 'admin.rangeAll',
} as const satisfies Record<VpnBandwidthRange, string>;

const DIRECTIONS = ['down', 'up'] as const satisfies readonly BandwidthDirection[];

const DIRECTION_LABEL = {
  down: 'vpnBandwidth.down',
  up: 'vpnBandwidth.up',
} as const satisfies Record<BandwidthDirection, string>;

export function VpnBandwidthSection() {
  const t = useT();
  const vpn = useVpnApi();
  const [range, setRange] = useState<VpnBandwidthRange>('24h');
  const [direction, setDirection] = useState<BandwidthDirection>('down');
  const { data, loading, failed, reload } = usePoll(
    ['admin', 'vpn', 'bandwidth', range],
    () => vpn.bandwidth(range),
    POLL_MS,
  );

  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{t('vpnBandwidth.title')}</Section.Title>
        <Section.Actions>
          <Row gap={10}>
            <Picker
              label={t('vpnBandwidth.direction')}
              value={direction}
              options={DIRECTIONS}
              labelFor={(one) => t(DIRECTION_LABEL[one])}
              onChange={setDirection}
            />
            <Picker
              label={t('vpnBandwidth.window')}
              value={range}
              options={RANGES}
              labelFor={(one) => t(RANGE_LABEL[one])}
              onChange={setRange}
            />
          </Row>
        </Section.Actions>
      </Section.Header>
      <Body view={data} loading={loading} failed={failed} onRetry={reload} direction={direction} />
    </Section.Root>
  );
}

function Body({
  view,
  loading,
  failed,
  onRetry,
  direction,
}: Readonly<{
  view: VpnBandwidthView | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  direction: BandwidthDirection;
}>) {
  if (loading) return <ModuleLoading panels={1} />;
  if (failed) return <ModuleFailed retry={onRetry} />;
  if (!view) return <Nothing message="vpnBandwidth.noEngine" />;
  if (view.series.sealedDown.length === 0) return <Nothing message="vpnBandwidth.empty" />;
  return (
    <>
      <SealBanner view={view} />
      <BandwidthChart view={view} direction={direction} />
    </>
  );
}

function Nothing({ message }: Readonly<{ message: string }>) {
  const t = useT();
  return (
    <EmptyState.Root size="sm" icon="chart-line">
      <EmptyState.Title>{t(message)}</EmptyState.Title>
    </EmptyState.Root>
  );
}

function Picker<V extends string>({
  label,
  value,
  options,
  labelFor,
  onChange,
}: Readonly<{
  label: string;
  value: V;
  options: readonly V[];
  labelFor: (value: V) => string;
  onChange: (value: V) => void;
}>) {
  return (
    <Select.Root
      label={label}
      value={value}
      onValueChange={(next) => {
        const picked = options.find((one) => one === next);
        if (picked) onChange(picked);
      }}
    >
      <Select.Trigger />
      {options.map((one) => (
        <Select.Item key={one} value={one} label={labelFor(one)} />
      ))}
    </Select.Root>
  );
}
