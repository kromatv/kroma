import type { PerfSlowRequest, PerfStep } from '@kromatv/client/performance';
import type { Translate } from '@kromatv/i18n';
import { TABULAR } from '@kromatv/module-sdk';
import { useT } from '@kromatv/ui';
import { Box, Drawer, Row, Text } from '@kromatv/ui/kit';
import {
  PerfDrawerHead,
  PerfSection,
  PerfSegmentLine,
  type PerfStat,
  PerfStats,
} from '#web/features/admin/performance-drawer-parts.component';
import { formatMs, kindLabel, shortLabel } from '#web/features/admin/performance-format';
import { PerfEmpty } from '#web/features/admin/performance-table.component';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';
import { PerfLink } from '#web/features/admin/performance-link.component';

const MIN_BAR = 0.004;

function figures(request: PerfSlowRequest, t: Translate): PerfStat[] {
  const kinds = Object.entries(request.kinds).map(([kind, total]) => ({
    label: kindLabel(kind, t),
    value: `${total.count} · ${formatMs(total.ms)}`,
  }));
  return [
    { labelKey: 'perf.colTotal', value: formatMs(request.totalMs) },
    { labelKey: 'perf.colStatus', value: request.status === null ? '-' : String(request.status) },
    { labelKey: 'perf.colSegments', value: String(request.segments) },
    ...kinds,
  ];
}

function Bar({ step, totalMs }: Readonly<{ step: PerfStep; totalMs: number }>) {
  const whole = Math.max(totalMs, 0.001);
  const before = Math.min(step.offsetMs / whole, 1);
  const width = Math.max(step.durationMs / whole, MIN_BAR);
  return (
    <Row h={6} radius="xs" bg="tint/7" overflow="hidden">
      <Box flex={before} />
      <Box flex={width} bg={step.kind === 'sql' ? 'accent' : 'info'} />
      <Box flex={Math.max(1 - before - width, 0)} />
    </Row>
  );
}

function Step({ step, totalMs }: Readonly<{ step: PerfStep; totalMs: number }>) {
  return (
    <PerfLink open={{ segment: step.key }}>
      <Box py={6}>
        <Row between gap={12}>
          <Text variant="meta" font="mono" lines={1} flex={1} minW={0}>
            {shortLabel(step.label)}
          </Text>
          <Text variant="meta" color="textMuted" style={TABULAR}>
            {formatMs(step.durationMs)}
          </Text>
        </Row>
        <Bar step={step} totalMs={totalMs} />
      </Box>
    </PerfLink>
  );
}

function Waterfall({ request }: Readonly<{ request: PerfSlowRequest }>) {
  const t = useT();
  return (
    <PerfSection titleKey="perf.drawerWaterfall">
      {request.waterfall.map((step) => (
        <Step key={`${step.offsetMs}:${step.key}`} step={step} totalMs={request.totalMs} />
      ))}
      {request.droppedSteps > 0 ? (
        <Text variant="meta" color="textDim" mt={8}>
          {t('perf.droppedSteps', { count: request.droppedSteps })}
        </Text>
      ) : null}
    </PerfSection>
  );
}

function SlowBody({ request }: Readonly<{ request: PerfSlowRequest }>) {
  const t = useT();
  return (
    <>
      <PerfStats stats={figures(request, t)} />
      <PerfSection titleKey="perf.colRepeat">
        {request.repeats.map((repeat) => (
          <PerfSegmentLine key={repeat.key} segment={repeat} figure={`${repeat.count}×`} />
        ))}
      </PerfSection>
      <Waterfall request={request} />
    </>
  );
}

function SlowContent({
  request,
  failed,
}: Readonly<{ request: PerfSlowRequest | null; failed: boolean }>) {
  if (request) {
    return <SlowBody request={request} />;
  }
  return failed ? <PerfEmpty icon="stopwatch" labelKey="perf.slowGone" /> : null;
}

/** One slow request: what it cost, what it repeated, and every segment on its
 *  timeline. */
export function PerfSlowDrawer({ id, onClose }: Readonly<{ id: string; onClose: () => void }>) {
  const t = useT();
  const { client } = useAuth();
  const { data, failed } = usePoll(
    ['admin', 'performance', 'slow-request', id],
    () => client.performance.slowRequest(id),
    60000,
  );
  return (
    <Drawer.Root open onClose={onClose} title={data?.name ?? t('perf.tabSlow')}>
      <Drawer.Header>
        <PerfDrawerHead eyebrow={t('perf.tabSlow')} title={data?.name ?? ''} />
      </Drawer.Header>
      <Drawer.Panel>
        <SlowContent request={data} failed={failed} />
      </Drawer.Panel>
    </Drawer.Root>
  );
}
