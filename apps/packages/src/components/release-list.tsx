import { Box, Column, Row } from '@kroma/ui/kit/atoms/box';
import { Divider } from '@kroma/ui/kit/atoms/divider';
import { Text } from '@kroma/ui/kit/atoms/text';
import { EmptyState } from '@kroma/ui/kit/molecules/empty-state';
import { Pagination, paginate } from '@kroma/ui/kit/molecules/pagination';
import { useState } from 'react';
import { ReleaseRow } from '#site/components/release-row';
import { ReleaseSearch } from '#site/components/release-search';
import { filterReleases } from '#site/lib/filter-releases';
import type { Release } from '#site/lib/release';

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
          <Text variant="overline" color="accentText">
            All releases
          </Text>
          {shown.total > 0 ? (
            <Text variant="meta" color="textDim">
              {shown.first}-{shown.last} of {shown.total}
            </Text>
          ) : null}
        </Column>
        <ReleaseSearch value={query} onChange={search} />
      </Row>

      {shown.total === 0 ? (
        <EmptyState.Root size="sm" icon="search-off">
          <EmptyState.Title>No matching release</EmptyState.Title>
          <EmptyState.Hint>
            Try a version number such as 0.1.36, or a channel such as nightly.
          </EmptyState.Hint>
        </EmptyState.Root>
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
