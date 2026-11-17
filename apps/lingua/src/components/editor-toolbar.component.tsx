import { styles, useBreakpoint, useStyles } from '@kromatv/ui/kit';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import type { ReactNode } from 'react';
import { SearchField } from '#site/components/search-field.component';
import { FilterChips } from '#site/components/filter-chips.component';
import { ShortcutsHint } from '#site/components/shortcuts-hint.component';
import { messageFilters } from '#site/lib/filter-choices';
import type { RowFilter } from '#site/lib/row-filter';
import { useHeaderHeight } from '#site/lib/use-header-height.hook';

const sDefinition = styles({
  pinned: { position: 'sticky', zIndex: 9 },
});

/** What the editor's toolbar reads and changes: the search, the filter in force, and how many messages each filter lists. */
export interface MessageQuery {
  query: string;
  onQueryChange: (next: string) => void;
  filter: RowFilter;
  onFilterChange: (next: RowFilter) => void;
  counts: Record<RowFilter, number>;
}

function Bar({ pinned, children }: Readonly<{ pinned: boolean; children: ReactNode }>) {
  const s = useStyles(sDefinition);
  const top = useHeaderHeight();
  return (
    <Box style={pinned ? [s.pinned, { top }] : undefined} bg="bg" py={10}>
      {children}
    </Box>
  );
}

/** The editor's search, its filters with what each lists, and, on a wide screen for a viewer who can edit, its shortcuts; on a wide screen, pinned under the header while the list scrolls there. */
export function EditorToolbar({
  list,
  editable,
}: Readonly<{ list: MessageQuery; editable: boolean }>) {
  const wide = useBreakpoint() !== 'base';
  return (
    <Bar pinned={wide}>
      <Column gap={10}>
        <Row gap={12} wrap align="center">
          <Box grow={1} shrink={1} basis={260} minW={0}>
            <SearchField
              label="Search this section"
              placeholder={wide ? 'Search keys, source and translations' : 'Search messages'}
              value={list.query}
              onValueChange={list.onQueryChange}
            />
          </Box>
          <FilterChips
            label="Show messages"
            value={list.filter}
            onValueChange={list.onFilterChange}
            choices={messageFilters(list.counts)}
          />
        </Row>
        {wide && editable ? <ShortcutsHint /> : null}
      </Column>
    </Bar>
  );
}
