import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { Box, Row, SegmentGroup, Select, useBreakpoint } from '@kromatv/ui/kit';
import { RELEASE_FILTERS, RELEASE_SORTS, type ReleaseSort, releaseSortOf } from './release-sort';
import type { ReleaseView } from './use-release-view';

/** A stable empty list, so a dialog that has not searched yet does not rebuild
 *  its view on every render. */
export const NO_RELEASES: readonly ScoredReleaseView[] = [];

const FILTER_LABEL: Record<string, string> = {
  accepted: 'requests.filter.accepted',
  rejected: 'requests.filter.rejected',
  all: 'requests.filter.all',
};

const SORT_LABEL: Record<ReleaseSort, string> = {
  score: 'requests.colScore',
  size: 'requests.colSize',
  seeders: 'acq.colSeeders',
  date: 'requests.colPublished',
};

export function ReleaseFilters({ view }: Readonly<{ view: ReleaseView }>) {
  const t = useT();
  const narrow = useBreakpoint() === 'base';
  const count: Record<string, number> = {
    accepted: view.acceptedCount,
    rejected: view.rejectedCount,
    all: view.acceptedCount + view.rejectedCount,
  };
  return (
    <Row wrap between gap={10} align="center">
      <SegmentGroup.Root
        value={view.filter}
        onValueChange={view.setFilter}
        label={t('acq.filterReleases')}
        size="sm"
      >
        {RELEASE_FILTERS.map((one) => (
          <SegmentGroup.Item key={one} value={one}>
            <SegmentGroup.Label>{`${t(FILTER_LABEL[one] ?? '')} ${count[one] ?? 0}`}</SegmentGroup.Label>
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
      {narrow ? (
        <Box w="100%">
          <Select.Root
            value={view.sort}
            onValueChange={(next) => {
              const picked = releaseSortOf(next);
              if (picked) view.setSort(picked);
            }}
            label={t('requests.sortBy')}
          >
            <Select.Trigger size="sm" block />
            {RELEASE_SORTS.map((one) => (
              <Select.Item key={one} value={one} label={t(SORT_LABEL[one])} />
            ))}
          </Select.Root>
        </Box>
      ) : null}
    </Row>
  );
}
