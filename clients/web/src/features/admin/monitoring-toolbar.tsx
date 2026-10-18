import type { MessageKey } from '@kromatv/i18n';
import { useT } from '@kromatv/ui';
import {
  Box,
  Focusable,
  Icon,
  Row,
  SegmentGroup,
  Select,
  styles,
  Text,
  useBreakpoint,
} from '@kromatv/ui/kit';
import type {
  LibraryFilter,
  LibraryKind,
  LibrarySort,
  LibraryState,
} from '#web/features/admin/monitoring-index-model';
import { COLUMN, POSTER_W, type RowColumns } from '#web/features/admin/monitoring-title-row';

const s = styles({
  head: { row: true, align: 'center', gap: 8 },
});

export function LibraryFilters({
  filter,
  onChange,
}: Readonly<{ filter: LibraryFilter; onChange: (next: LibraryFilter) => void }>) {
  const t = useT();
  return (
    <Row wrap gap={10} align="center">
      <SegmentGroup.Root
        value={filter.kind}
        onValueChange={(kind: LibraryKind) => onChange({ ...filter, kind })}
        label={t('monitoring.colTitle')}
      >
        <SegmentGroup.Item value="all">
          <SegmentGroup.Label>{t('monitoring.filter.allKinds')}</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="movie">
          <SegmentGroup.Label>{t('monitoring.filter.movies')}</SegmentGroup.Label>
        </SegmentGroup.Item>
        <SegmentGroup.Item value="show">
          <SegmentGroup.Label>{t('monitoring.filter.shows')}</SegmentGroup.Label>
        </SegmentGroup.Item>
      </SegmentGroup.Root>
      <StateFilter filter={filter} onChange={onChange} />
    </Row>
  );
}

const STATES: { value: LibraryState; key: MessageKey }[] = [
  { value: 'all', key: 'monitoring.filter.all' },
  { value: 'monitored', key: 'monitoring.filter.followed' },
  { value: 'unmonitored', key: 'monitoring.filter.unfollowed' },
  { value: 'missing', key: 'monitoring.filter.withMissing' },
  { value: 'continuing', key: 'monitoring.filter.continuing' },
];

function StateFilter({
  filter,
  onChange,
}: Readonly<{ filter: LibraryFilter; onChange: (next: LibraryFilter) => void }>) {
  const t = useT();
  const pick = (state: LibraryState) => onChange({ ...filter, state });
  if (useBreakpoint() === 'base') {
    return (
      <Box flex minW={160}>
        <Select.Root
          label={t('monitoring.colTracked')}
          value={filter.state}
          onValueChange={(next) => pick(next as LibraryState)}
        >
          <Select.Trigger block size="sm" />
          {STATES.map((state) => (
            <Select.Item key={state.value} value={state.value} label={t(state.key)} />
          ))}
        </Select.Root>
      </Box>
    );
  }
  return (
    <SegmentGroup.Root value={filter.state} onValueChange={pick} label={t('monitoring.colTracked')}>
      {STATES.map((state) => (
        <SegmentGroup.Item key={state.value} value={state.value}>
          <SegmentGroup.Label>{t(state.key)}</SegmentGroup.Label>
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}

export function LibraryHead({
  filter,
  columns,
  selecting,
  onChange,
}: Readonly<{
  filter: LibraryFilter;
  columns: RowColumns;
  selecting: boolean;
  onChange: (next: LibraryFilter) => void;
}>) {
  const t = useT();
  const sortBy = (sort: LibrarySort) =>
    onChange({ ...filter, sort, descending: filter.sort === sort ? !filter.descending : false });
  return (
    <Row align="center" gap={16} px={16} py={10} minW={0}>
      {selecting ? <Box w={20} shrink={0} /> : null}
      <Box w={POSTER_W} shrink={0} />
      <Box flex minW={0}>
        <SortName filter={filter} sort="title" label={t('monitoring.colTitle')} onPress={sortBy} />
      </Box>
      {columns.counts ? (
        <Box w={COLUMN.status} shrink={0}>
          <Text variant="overline" color="textMuted" lines={1}>
            {t('monitoring.colStatus')}
          </Text>
        </Box>
      ) : null}
      {columns.counts ? (
        <Box w={COLUMN.held} shrink={0}>
          <Text variant="overline" color="textMuted" lines={1}>
            {t('monitoring.statOnDisk')}
          </Text>
        </Box>
      ) : null}
      {columns.counts ? (
        <Box w={COLUMN.missing} shrink={0}>
          <SortName
            filter={filter}
            sort="missing"
            label={t('monitoring.colMissing')}
            onPress={sortBy}
          />
        </Box>
      ) : null}
      {columns.extras ? (
        <Box w={COLUMN.size} shrink={0} align="flex-end">
          <SortName filter={filter} sort="size" label={t('monitoring.colSize')} onPress={sortBy} />
        </Box>
      ) : null}
      {columns.airing ? (
        <Box w={COLUMN.airing} shrink={0} align="flex-end">
          <Text variant="overline" color="textMuted" lines={1}>
            {t('monitoring.colNextAiring')}
          </Text>
        </Box>
      ) : null}
      <Box w={COLUMN.search} shrink={0} />
      <Box w={COLUMN.follow} shrink={0} align="center">
        <Text variant="overline" color="textMuted" lines={1}>
          {t('monitoring.colFollowed')}
        </Text>
      </Box>
    </Row>
  );
}

function SortName({
  filter,
  sort,
  label,
  onPress,
}: Readonly<{
  filter: LibraryFilter;
  sort: LibrarySort;
  label: string;
  onPress: (sort: LibrarySort) => void;
}>) {
  const on = filter.sort === sort;
  return (
    <Focusable
      label={label}
      onPress={() => onPress(sort)}
      hitSlop={8}
      ring="focusInset"
      style={s.head}
    >
      <Text variant="overline" color={on ? 'accentText' : 'textMuted'} lines={1}>
        {label}
      </Text>
      {on ? (
        <Icon name={filter.descending ? 'chevron-down' : 'chevron-up'} size={14} color="accent" />
      ) : null}
    </Focusable>
  );
}
