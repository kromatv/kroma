import { useT } from '@kroma/module-sdk';
import type { IconName } from '@kroma/ui/kit';
import { Button, Field, Icon, Row, Select, Text } from '@kroma/ui/kit';
import { useMemo } from 'react';
import type { DownloadClientView, DownloadQuery, DownloadStatsView } from './schemas';

interface FilterOption {
  value: string;
  label: string;
  icon: IconName;
  note?: string;
}

const GROUPS = [
  { value: 'active', icon: 'download' },
  { value: 'done', icon: 'circle-check' },
  { value: 'failed', icon: 'alert-triangle' },
] as const satisfies readonly { value: string; icon: IconName }[];

const GROUP_STATUSES: Record<string, readonly string[]> = {
  active: ['queued', 'downloading', 'seeding', 'paused'],
  done: ['completed', 'imported'],
  failed: ['failed', 'removed'],
};

const KINDS = [
  { value: 'movie', icon: 'movie' },
  { value: 'season', icon: 'stack' },
  { value: 'episode', icon: 'device-tv' },
] as const satisfies readonly { value: string; icon: IconName }[];

const SEPARATOR = ',';
const ALL = 'all';

function selected(value: string | undefined): string[] {
  return value ? value.split(SEPARATOR).filter(Boolean) : [];
}

function joined(values: readonly string[]): string | undefined {
  return values.length > 0 ? values.join(SEPARATOR) : undefined;
}

function countFor(group: string, byStatus: Record<string, number>): number {
  return (GROUP_STATUSES[group] ?? []).reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
}

interface FilterSelectProps {
  label: string;
  all: string;
  value: string | undefined;
  options: readonly FilterOption[];
  onValueChange: (next: string | undefined) => void;
}

function FilterSelect({ label, all, value, options, onValueChange }: Readonly<FilterSelectProps>) {
  const picked = useMemo(() => selected(value), [value]);
  return (
    <Select.Root
      multiple
      label={label}
      placeholder={label}
      value={picked}
      onValueChange={(next, { item }) =>
        onValueChange(
          options.some((option) => option.value === item.value) ? joined(next) : undefined,
        )
      }
    >
      <Select.Trigger size="sm" />
      {/* Written out of the parts so it carries no checkbox: it is the row that
          undoes the others, and a box that never ticks would say otherwise. */}
      <Select.Item value={ALL} label={all}>
        <Icon name="list" size={18} color="textMuted" />
        <Text variant="body" color="textMuted">
          {all}
        </Text>
      </Select.Item>
      {options.map((option) => (
        <Select.Item key={option.value} value={option.value} icon={option.icon} note={option.note}>
          {option.label}
        </Select.Item>
      ))}
    </Select.Root>
  );
}

interface DownloadFiltersProps {
  query: DownloadQuery;
  onQueryChange: (next: DownloadQuery) => void;
  stats: DownloadStatsView;
  clients: readonly DownloadClientView[];
  search: string;
  onSearchChange: (next: string) => void;
}

/** The queue's filter bar. Changing anything resets to the first page, because
 *  page 4 of a different filter is a different list. */
export function DownloadFilters({
  query,
  onQueryChange,
  stats,
  clients,
  search,
  onSearchChange,
}: Readonly<DownloadFiltersProps>) {
  const t = useT();
  const set = (patch: Partial<DownloadQuery>) => onQueryChange({ ...query, ...patch, page: 1 });
  const narrowed = Boolean(query.status || query.kind || query.clientId || search.trim());

  return (
    <Row wrap gap={10} align="center" mb={14}>
      <Field.Root
        label={t('downloads.searchLabel')}
        hideLabel
        flex
        minW={240}
        size="sm"
        value={search}
        onValueChange={onSearchChange}
      >
        <Field.Input icon="search" placeholder={t('downloads.searchPlaceholder')} />
      </Field.Root>

      <FilterSelect
        label={t('downloads.filterStatus')}
        all={t('downloads.group.all')}
        value={query.status}
        options={GROUPS.map(({ value, icon }) => ({
          value,
          icon,
          label: t(`downloads.group.${value}`),
          note: String(countFor(value, stats.byStatus)),
        }))}
        onValueChange={(status) => set({ status })}
      />

      <FilterSelect
        label={t('downloads.filterKind')}
        all={t('downloads.kind.all')}
        value={query.kind}
        options={KINDS.map(({ value, icon }) => ({
          value,
          icon,
          label: t(`downloads.kind.${value}`),
        }))}
        onValueChange={(kind) => set({ kind })}
      />

      {/* One engine is not a choice; naming it would only take up room. */}
      {clients.length > 1 ? (
        <FilterSelect
          label={t('downloads.filterClient')}
          all={t('downloads.client.all')}
          value={query.clientId}
          options={clients.map((client) => ({
            value: client.id,
            icon: 'server',
            label: client.name,
          }))}
          onValueChange={(clientId) => set({ clientId })}
        />
      ) : null}

      {narrowed ? (
        <Button
          variant="ghost"
          size="sm"
          icon="x"
          label={t('downloads.clearFilters')}
          onPress={() => {
            onSearchChange('');
            onQueryChange({ page: 1 });
          }}
        />
      ) : null}
    </Row>
  );
}
