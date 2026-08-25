import type { MessageKey } from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  Chip,
  Icon,
  type IconName,
  If,
  Row,
  SegmentGroup,
  Select,
  useBreakpoint,
} from '@kroma/ui/kit';
import {
  SAVED_SORTS,
  SAVED_TAB_COPY,
  SAVED_TABS,
  type SavedFacets,
  type SavedFilter,
  type SavedKind,
  type SavedSort,
  type SavedTab,
  toSavedSort,
} from '#web/features/catalog/saved-titles';

const SORT_LABEL_KEY: Record<SavedSort, MessageKey> = {
  recent: 'content.sortRecent',
  title: 'content.sortTitle',
  year: 'content.sortYear',
  rating: 'content.sortRating',
};

const SORT_ICON: Record<SavedSort, IconName> = {
  recent: 'history',
  title: 'sort-ascending-letters',
  year: 'calendar',
  rating: 'star',
};

const SORT_TRIGGER = { flexShrink: 0, minWidth: 196 } as const;

export interface SavedTitlesBarProps {
  tab: SavedTab;
  onTab: (tab: SavedTab) => void;
  facets: SavedFacets;
  filter: SavedFilter;
  onFilter: (filter: SavedFilter) => void;
  sort: SavedSort;
  onSort: (sort: SavedSort) => void;
}

export function SavedTitlesBar({
  tab,
  onTab,
  facets,
  filter,
  onFilter,
  sort,
  onSort,
}: Readonly<SavedTitlesBarProps>) {
  const t = useT();
  const step = useBreakpoint();
  const wide = step === 'lg' || step === 'tv';
  const phone = step === 'base';
  const pickKind = (kind: SavedKind) => onFilter({ ...filter, kind });

  const tabs = (
    <SegmentGroup.Root<SavedTab>
      value={tab}
      onValueChange={onTab}
      size="sm"
      stretch={phone}
      label={t('nav.myList')}
    >
      {SAVED_TABS.map((one) => (
        <SegmentGroup.Item key={one} value={one} icon={SAVED_TAB_COPY[one].icon}>
          <SegmentGroup.Label>{t(SAVED_TAB_COPY[one].label)}</SegmentGroup.Label>
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );

  const chips = (
    <Row gap={8} align="center" wrap shrink={1}>
      <If condition={(facets.movies > 0 && facets.shows > 0) || filter.kind !== 'all'}>
        <Chip
          active={filter.kind === 'all'}
          pressed={filter.kind === 'all'}
          label={t('content.filterAll')}
          onPress={() => pickKind('all')}
        />
        <Chip
          icon="movie"
          active={filter.kind === 'movie'}
          pressed={filter.kind === 'movie'}
          label={t('nav.films')}
          count={facets.movies}
          onPress={() => pickKind('movie')}
        />
        <Chip
          icon="device-tv"
          active={filter.kind === 'show'}
          pressed={filter.kind === 'show'}
          label={t('nav.series')}
          count={facets.shows}
          onPress={() => pickKind('show')}
        />
      </If>
      <If condition={facets.unavailable > 0}>
        <Chip
          icon="clock"
          active={filter.unavailableOnly}
          pressed={filter.unavailableOnly}
          label={t('content.filterUnavailable')}
          count={facets.unavailable}
          onPress={() => onFilter({ ...filter, unavailableOnly: !filter.unavailableOnly })}
        />
      </If>
    </Row>
  );

  const sorter = (
    <If condition={facets.total > 0}>
      <Select.Root
        label={t('browse.sortBy')}
        value={sort}
        onValueChange={(value) => {
          const next = toSavedSort(value);
          if (next) onSort(next);
        }}
      >
        <Select.Trigger size="sm" style={phone ? undefined : SORT_TRIGGER}>
          {phone ? <Icon name={SORT_ICON[sort]} size={18} color="textMuted" /> : <Select.Value />}
        </Select.Trigger>
        {SAVED_SORTS.map((mode) => (
          <Select.Item
            key={mode}
            value={mode}
            label={t(SORT_LABEL_KEY[mode])}
            icon={SORT_ICON[mode]}
          />
        ))}
      </Select.Root>
    </If>
  );

  if (wide) {
    return (
      <Row gap={16} align="center" justify="space-between" wrap mb={24}>
        <Row gap={16} align="center" shrink={1}>
          {tabs}
          {chips}
        </Row>
        {sorter}
      </Row>
    );
  }
  return (
    <Box gap={10} mb={20}>
      {tabs}
      <Row gap={8} align="flex-start" justify="space-between">
        {chips}
        {sorter}
      </Row>
    </Box>
  );
}
