import { styles, useBreakpoint, useStyles } from '@kromatv/ui/kit';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { TextField } from '@kromatv/ui/kit/atoms/text-field';
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

/** The editor's search, its filters with what each lists, and, on a wide screen, its shortcuts; pinned to the top while the list scrolls there. */
export function EditorToolbar({ list }: Readonly<{ list: MessageQuery }>) {
  const s = useStyles(sDefinition);
  const wide = useBreakpoint() !== 'base';
  return (
    <Box style={wide ? s.pinned : undefined} bg="bg" py={10}>
      <Column gap={10}>
        <Row gap={12} wrap align="center">
          <Box grow={1} shrink={1} basis={260} minW={0}>
            <TextField
              type="search"
              icon="search"
              size="sm"
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
        {wide ? <ShortcutsHint /> : null}
      </Column>
    </Box>
  );
}
