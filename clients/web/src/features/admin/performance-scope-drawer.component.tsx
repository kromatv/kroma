import type { PerfScopeRow } from '@kromatv/client/performance';
import { useFormat, useT } from '@kromatv/ui';
import { Drawer } from '@kromatv/ui/kit';
import {
  PerfDrawerHead,
  PerfFlagSection,
  PerfSection,
  PerfSegmentLine,
  type PerfStat,
  PerfStats,
} from '#web/features/admin/performance-drawer-parts.component';
import { formatMs } from '#web/features/admin/performance-format';

function figures(row: PerfScopeRow, bytes: (n: number) => string): PerfStat[] {
  return [
    { labelKey: 'perf.colCalls', value: String(row.count) },
    { labelKey: 'perf.colTotal', value: formatMs(row.totalMs) },
    { labelKey: 'perf.colP50', value: formatMs(row.p50Ms) },
    { labelKey: 'perf.colP95', value: formatMs(row.p95Ms) },
    { labelKey: 'perf.colP99', value: formatMs(row.p99Ms) },
    { labelKey: 'perf.colMax', value: formatMs(row.maxMs) },
    { labelKey: 'perf.colErrors', value: `${row.serverErrors} · ${row.clientErrors}` },
    { labelKey: 'perf.colBytes', value: row.bytesPerCall === null ? '-' : bytes(row.bytesPerCall) },
  ];
}

function ScopeBody({ row }: Readonly<{ row: PerfScopeRow }>) {
  const fmt = useFormat();
  return (
    <>
      <PerfStats stats={figures(row, fmt.bytes)} />
      <PerfFlagSection flags={row.flags} />
      <PerfSection titleKey="perf.drawerParts">
        {row.parts.map((part) => (
          <PerfSegmentLine
            key={part.key}
            segment={part}
            figure={`${part.perCall.toFixed(1)}× · ${formatMs(part.msPerCall)}`}
          />
        ))}
      </PerfSection>
    </>
  );
}

/** A route or job: its spread, its signals, and the segments one call of it
 *  runs, heaviest first. */
export function PerfScopeDrawer({
  row,
  onClose,
}: Readonly<{ row: PerfScopeRow; onClose: () => void }>) {
  const t = useT();
  return (
    <Drawer.Root open onClose={onClose} title={row.name}>
      <Drawer.Header>
        <PerfDrawerHead
          eyebrow={t(row.kind === 'job' ? 'perf.kindJob' : 'perf.kindRequest')}
          title={row.name}
        />
      </Drawer.Header>
      <Drawer.Panel>
        <ScopeBody row={row} />
      </Drawer.Panel>
    </Drawer.Root>
  );
}
