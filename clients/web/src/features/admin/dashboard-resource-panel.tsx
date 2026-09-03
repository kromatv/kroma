import type { MetricRange, MetricsSnapshot } from '@kroma/client/admin';
import { useT } from '@kroma/ui';
import { EmptyState, Row, Section } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import {
  type ChartScope,
  type Choice,
  FilterSelect,
  METRIC_RANGES,
  useChoice,
  useRangeOptions,
  useScopeOptions,
} from '#web/features/admin/dashboard-filters';
import { usePoll } from '#web/features/admin/shell';
import { useAuth } from '#web/shared/lib/auth';

const LIVE_POLL_MS = 5000;
const STORED_POLL_MS = 60000;

const DEFAULT_SAMPLE_MS = 3000;

export interface MetricsWindow {
  range: Choice<MetricRange>;
  metrics: MetricsSnapshot | null;
}

/** Each chart calls this for itself: three charts on one range share the
 *  query, and moving one leaves the other two where they were. */
export function useMetricsWindow(): MetricsWindow {
  const { client } = useAuth();
  const range = useChoice(useRangeOptions(METRIC_RANGES), 'live');
  const { data } = usePoll(
    ['admin', 'metrics', range.value],
    () => client.admin.metrics(range.value),
    range.value === 'live' ? LIVE_POLL_MS : STORED_POLL_MS,
  );
  return { range, metrics: data };
}

export function useScopeChoice<S extends ChartScope>(scopes: readonly [S, ...S[]]): Choice<S> {
  return useChoice(useScopeOptions(scopes), scopes[0]);
}

export function startedAtOf(metrics: MetricsSnapshot | null): number | undefined {
  return metrics?.startedAt || undefined;
}

export function stepSecOf(metrics: MetricsSnapshot | null): number {
  return metrics?.stepSecs || (metrics?.sampleIntervalMs ?? DEFAULT_SAMPLE_MS) / 1000;
}

export function meanOf(mean: number | undefined, values: readonly number[]): number {
  if (mean !== undefined) return mean;
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

interface ResourceSectionProps<S extends ChartScope> {
  title: string;
  scope: Choice<S>;
  range: Choice<MetricRange>;
  complete: boolean;
  children: ReactNode;
}

export function ResourceSection<S extends ChartScope>({
  title,
  scope,
  range,
  complete,
  children,
}: Readonly<ResourceSectionProps<S>>) {
  const t = useT();
  return (
    <Section.Root mt={28}>
      <Section.Header>
        <Section.Title>{title}</Section.Title>
        <Section.Actions>
          <Row gap={10}>
            <FilterSelect label={title} choice={scope} />
            <FilterSelect label={title} choice={range} />
          </Row>
        </Section.Actions>
      </Section.Header>
      {complete ? (
        children
      ) : (
        <EmptyState.Root size="sm" icon="chart-line">
          <EmptyState.Title>{t('admin.rangeIncomplete')}</EmptyState.Title>
        </EmptyState.Root>
      )}
    </Section.Root>
  );
}
