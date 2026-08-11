import { useState } from 'react';
import { ReleaseRow } from '#site/components/release-row';
import { ReleaseSearch } from '#site/components/release-search';
import { filterReleases } from '#site/lib/filter-releases';
import type { Release } from '#site/lib/release';
import { Box, Column, Row } from '#ui/components/atoms/box';
import { Divider } from '#ui/components/atoms/divider';
import { Txt } from '#ui/components/atoms/text';
import { EmptyState } from '#ui/components/molecules/empty-state';
import { Pagination, paginate } from '#ui/components/molecules/pagination';

const PAGE_SIZE = 25;

export interface ReleaseListProps {
  releases: readonly Release[];
  current?: readonly Release[];
}

export function ReleaseList({ releases, current = [] }: Readonly<ReleaseListProps>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const matches = filterReleases(releases, query);
  const shown = paginate(matches, page, PAGE_SIZE);

  const search = (next: string) => {
    setQuery(next);
    setPage(1);
  };

  return (
    <Column gap={20}>
      <Row gap={16} wrap between align="flex-end">
        <Column gap={4}>
          <Txt variant="overline" color="accentText">
            All releases
          </Txt>
          {shown.total > 0 ? (
            <Txt variant="meta" color="textDim">
              {shown.first}-{shown.last} of {shown.total}
            </Txt>
          ) : null}
        </Column>
        <ReleaseSearch value={query} onChange={search} />
      </Row>

      {shown.total === 0 ? (
        <EmptyState
          compact
          icon="search-off"
          title="No matching release"
          hint="Try a version number such as 0.1.36, or a channel such as nightly."
        />
      ) : (
        <Box bg="surface1" radius="xl" border="border" overflow="hidden">
          {shown.items.map((r, i) => (
            <Column key={r.spk}>
              {i > 0 ? <Divider /> : null}
              <ReleaseRow release={r} current={current.includes(r)} />
            </Column>
          ))}
        </Box>
      )}

      {shown.pageCount > 1 ? (
        <Row justify="flex-end">
          <Pagination.Root
            label="Releases"
            size="sm"
            page={shown.page}
            pageCount={shown.pageCount}
            onPageChange={setPage}
          />
        </Row>
      ) : null}
    </Column>
  );
}
