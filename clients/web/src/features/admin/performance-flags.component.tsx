import type { PerfFlag } from '@kromatv/client/performance';
import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import { Badge, Row } from '@kromatv/ui/kit';

type Tone = 'danger' | 'warning' | 'info';

const FLAGS: Readonly<Record<string, { labelKey: MessageKey; tone: Tone }>> = {
  n_plus_one: { labelKey: 'perf.flagNPlusOne', tone: 'danger' },
  server_errors: { labelKey: 'perf.flagServerErrors', tone: 'danger' },
  full_scan: { labelKey: 'perf.flagFullScan', tone: 'danger' },
  auto_index: { labelKey: 'perf.flagAutoIndex', tone: 'danger' },
  slow_p95: { labelKey: 'perf.flagSlowP95', tone: 'warning' },
  cold_outlier: { labelKey: 'perf.flagColdOutlier', tone: 'warning' },
  temp_sort: { labelKey: 'perf.flagTempSort', tone: 'warning' },
  large_response: { labelKey: 'perf.flagLargeResponse', tone: 'info' },
};

function FlagBadge({ flag }: Readonly<{ flag: PerfFlag }>) {
  const t = useT();
  const known = FLAGS[flag];
  return <Badge tone={known?.tone ?? 'neutral'}>{known ? t(known.labelKey) : flag}</Badge>;
}

/** The problems a row shows by its numbers alone. */
export function PerfFlags({ flags }: Readonly<{ flags: readonly PerfFlag[] }>) {
  return (
    <Row wrap gap={4}>
      {flags.map((flag) => (
        <FlagBadge key={flag} flag={flag} />
      ))}
    </Row>
  );
}
