import type { PerfPlan, PerfSegmentRow } from '@kromatv/client/performance';
import { useT } from '@kromatv/ui';
import { Box, Button, CopyButton, Drawer, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import {
  PerfDrawerHead,
  PerfFlagSection,
  PerfSection,
  type PerfStat,
  PerfStats,
} from '#web/features/admin/performance-drawer-parts.component';
import { formatMs } from '#web/features/admin/performance-format';
import { useAuth } from '#web/shared/lib/auth';

function figures(row: PerfSegmentRow): PerfStat[] {
  return [
    { labelKey: 'perf.colCalls', value: String(row.count) },
    { labelKey: 'perf.colTotal', value: formatMs(row.totalMs) },
    { labelKey: 'perf.colP50', value: formatMs(row.p50Ms) },
    { labelKey: 'perf.colP95', value: formatMs(row.p95Ms) },
    { labelKey: 'perf.colMax', value: formatMs(row.maxMs) },
    { labelKey: 'perf.colRowsPerCall', value: row.rowsPerCall.toFixed(1) },
    { labelKey: 'perf.colFullScan', value: row.fullScanStepsPerCall.toFixed(0) },
    { labelKey: 'perf.colIndexes', value: `${row.autoIndexes} · ${row.sorts}` },
  ];
}

function PlanSteps({ plan }: Readonly<{ plan: PerfPlan }>) {
  if (!plan.plan) {
    return (
      <Text variant="meta" color="textDim">
        {plan.error}
      </Text>
    );
  }
  return (
    <Box px={14} py={10} radius="lg" bg="surface1" border="tint/7">
      {plan.plan.map((step) => (
        <Text key={step.id} variant="meta" font="mono" selectable>
          {step.detail}
        </Text>
      ))}
    </Box>
  );
}

function QueryPlan({ segmentKey }: Readonly<{ segmentKey: string }>) {
  const t = useT();
  const { client } = useAuth();
  const [plan, setPlan] = useState<PerfPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    setBusy(true);
    client.performance
      .plan(segmentKey)
      .then(setPlan)
      .catch(() => setPlan({ plan: null, error: t('perf.planFailed') }))
      .finally(() => setBusy(false));
  };
  return (
    <PerfSection titleKey="perf.drawerPlan">
      {plan ? (
        <PlanSteps plan={plan} />
      ) : (
        <Button
          variant="glass"
          size="sm"
          icon="list-details"
          label={t('perf.showPlan')}
          onPress={load}
          loading={busy}
        />
      )}
    </PerfSection>
  );
}

function Callers({ row }: Readonly<{ row: PerfSegmentRow }>) {
  return (
    <PerfSection titleKey="perf.drawerCallers">
      {row.callers.map((caller) => (
        <Row key={caller.name} between py={6}>
          <Text variant="meta" font="mono" lines={1}>
            {caller.name}
          </Text>
          <Text variant="meta" color="textMuted">
            {String(caller.count)}
          </Text>
        </Row>
      ))}
    </PerfSection>
  );
}

/** A statement, span or measured call: its text, its figures, who runs it, and
 *  for a statement of the core database its query plan. */
export function PerfSegmentDrawer({
  row,
  onClose,
}: Readonly<{ row: PerfSegmentRow; onClose: () => void }>) {
  const t = useT();
  return (
    <Drawer.Root open onClose={onClose} title={row.label}>
      <Drawer.Header>
        <PerfDrawerHead eyebrow={`${row.kind} · ${row.origin ?? '-'}`} title={row.label} />
        <Row mt={10}>
          <CopyButton value={row.label} size="sm" variant="glass" label={t('perf.copy')} />
        </Row>
      </Drawer.Header>
      <Drawer.Panel>
        <PerfStats stats={figures(row)} />
        <PerfFlagSection flags={row.flags} />
        {row.kind === 'sql' && row.origin === 'core' ? <QueryPlan segmentKey={row.key} /> : null}
        <Callers row={row} />
      </Drawer.Panel>
    </Drawer.Root>
  );
}
