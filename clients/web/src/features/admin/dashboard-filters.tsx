import type { MetricRange, WatchKind } from '@kroma/client/admin';
import { useT } from '@kroma/ui';
import { Select } from '@kroma/ui/kit';
import type { ReactNode } from 'react';
import { useState } from 'react';

/** The windows a panel reading the play log offers: no live ring, and nothing
 *  shorter than a day, because its buckets are days at their narrowest. */
export type WatchRange = Exclude<MetricRange, 'live' | '12h'>;

export const METRIC_RANGES = [
  'live',
  '12h',
  '24h',
  '7d',
  '30d',
  '90d',
  '1y',
  'all',
] as const satisfies readonly MetricRange[];

export const WATCH_RANGES = [
  '24h',
  '7d',
  '30d',
  '90d',
  '1y',
  'all',
] as const satisfies readonly WatchRange[];

export const WATCH_KINDS = ['movie', 'tv'] as const satisfies readonly WatchKind[];

export const EVERYONE = 'everyone';

export const ANY_KIND = 'all';

export type KindFilter = WatchKind | typeof ANY_KIND;

export type ChartScope = keyof typeof SCOPE_LABEL;

const RANGE_LABEL = {
  live: 'admin.rangeLive',
  '12h': 'admin.range12h',
  '24h': 'admin.range24h',
  '7d': 'admin.range7d',
  '30d': 'admin.range30d',
  '90d': 'admin.range90d',
  '1y': 'admin.range1y',
  all: 'admin.rangeAll',
} as const satisfies Record<MetricRange, string>;

const KIND_LABEL = {
  movie: 'admin.kindMovie',
  tv: 'admin.kindTv',
} as const satisfies Record<WatchKind, string>;

const SCOPE_LABEL = {
  all: 'admin.scopeAll',
  local: 'admin.scopeLocal',
  remote: 'admin.scopeRemote',
  kroma: 'admin.scopeKroma',
  system: 'admin.scopeSystem',
} as const;

const ALL_TIME_DAYS = 0;

const RANGE_DAYS = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  all: ALL_TIME_DAYS,
} as const satisfies Record<WatchRange, number>;

export function daysOf(range: WatchRange): number {
  return RANGE_DAYS[range];
}

export function kindLabelKey(kind: WatchKind) {
  return KIND_LABEL[kind];
}

export interface FilterOption<V extends string> {
  value: V;
  label: string;
  /** Drawn in the row's media slot and in the trigger once picked. An account
   *  filter carries the member's face here; a plain option leaves it out. */
  media?: ReactNode;
}

export interface Choice<V extends string> {
  value: V;
  options: readonly FilterOption<V>[];
  onChange: (value: V) => void;
}

export function useChoice<V extends string>(
  options: readonly FilterOption<V>[],
  initial: V,
): Choice<V> {
  const [value, setValue] = useState(initial);
  return { value, options, onChange: setValue };
}

export function useRangeOptions<R extends MetricRange>(ranges: readonly R[]): FilterOption<R>[] {
  const t = useT();
  return ranges.map((value) => ({ value, label: t(RANGE_LABEL[value]) }));
}

export function useScopeOptions<S extends ChartScope>(scopes: readonly S[]): FilterOption<S>[] {
  const t = useT();
  return scopes.map((value) => ({ value, label: t(SCOPE_LABEL[value]) }));
}

export function useKindOptions(): FilterOption<KindFilter>[] {
  const t = useT();
  return [
    { value: ANY_KIND, label: t('admin.allMedia') },
    ...WATCH_KINDS.map((value) => ({ value, label: t(KIND_LABEL[value]) })),
  ];
}

interface FilterSelectProps<V extends string> {
  label: string;
  choice: Choice<V>;
}

export function FilterSelect<V extends string>({ label, choice }: Readonly<FilterSelectProps<V>>) {
  return (
    <Select.Root
      label={label}
      value={choice.value}
      onValueChange={(next) => {
        const picked = choice.options.find((one) => one.value === next);
        if (picked) choice.onChange(picked.value);
      }}
    >
      <Select.Trigger />
      {choice.options.map((one) => (
        <Select.Item key={one.value} value={one.value} label={one.label}>
          {one.media ? <Select.Media>{one.media}</Select.Media> : null}
        </Select.Item>
      ))}
    </Select.Root>
  );
}
