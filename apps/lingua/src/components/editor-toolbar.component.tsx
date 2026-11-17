import { styles, useBreakpoint, useStyles } from '@kromatv/ui/kit';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { SearchField } from '#site/components/search-field.component';
import { FilterChips } from '#site/components/filter-chips.component';
import { ShortcutsHint } from '#site/components/shortcuts-hint.component';
import { messageFilters } from '#site/lib/filter-choices';
import type { RowFilter } from '#site/lib/row-filter';

const sDefinition = styles({
  pinned: { position: 'sticky', top: 0, zIndex: 9 },
});

/** What the editor's toolbar reads and changes: the search, the filter in force, and how many messages each filter lists. */
export interface MessageQuery {
  query: string;
  onQueryChange: (next: string) => void;
  filter: RowFilter;
  onFilterChange: (next: RowFilter) => void;
  counts: Record<RowFilter, number>;
}

/** The editor's search, its filters with what each lists, and, on a wide screen for a viewer who can edit, its shortcuts; pinned to the top while the list scrolls there. */
export function EditorToolbar({
  list,
  editable,
}: Readonly<{ list: MessageQuery; editable: boolean }>) {
  const s = useStyles(sDefinition);
  const wide = useBreakpoint() !== 'base';
  return (
    <Box style={wide ? s.pinned : undefined} bg="bg" py={10}>
      <Column gap={10}>
        <Row gap={12} wrap align="center">
          <Box grow={1} shrink={1} basis={260} minW={0}>
            <SearchField
              label="Search this section"
              placeholder="Search keys, source and translations"
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
    </Box>
  );
}
