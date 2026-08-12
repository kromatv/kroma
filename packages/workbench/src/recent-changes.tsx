// Everything in the kit, most recently changed first.
//
// A page rather than a panel: "what moved this week" is a question about the
// whole design system, not about the component that happens to be open, and an
// article is the one place in the workbench wide enough to answer it. A host
// puts it wherever it likes by rendering this in a `.page.mdx`.

import { Box, ListRow, styles, Text } from '@kroma/ui/kit';
import { space } from '@kroma/ui/tokens';
import { agoLabel, BUCKETS, bucketOf, dayLabel, type HistoryRow } from './history';
import { useKitHistory } from './source';

/** The whole kit by when it last changed, grouped into how long ago that was.
 * Renders nothing where the build read no history - on Metro, which has no
 * build-time reader at all. */
function RecentChanges() {
  const kit = useKitHistory();
  if (!kit) return null;
  if (kit.rows.length === 0) return <Nothing shallow={kit.shallow} />;
  const now = Date.now();
  return (
    <Box gap={space[6]}>
      {BUCKETS.map((bucket) => {
        const rows = kit.rows.filter((row) => bucketOf(row.entry, now) === bucket);
        if (rows.length === 0) return null;
        return (
          <Box key={bucket} gap={space[2]}>
            <Box row align="center" gap={space[2]}>
              <Text variant="overline" color="accent">
                {bucket}
              </Text>
              <Text variant="meta" color="textDim" style={s.count}>
                {rows.length}
              </Text>
            </Box>
            <ListRow.Group size="sm">
              {rows.map((row) => (
                <Row key={`${row.page ? 'page' : 'story'}:${row.id}`} row={row} onOpen={kit.open} />
              ))}
            </ListRow.Group>
          </Box>
        );
      })}
    </Box>
  );
}

function Row({ row, onOpen }: Readonly<{ row: HistoryRow; onOpen: (row: HistoryRow) => void }>) {
  const latest = row.entry.commits[0];
  return (
    <ListRow.Root icon={row.page ? 'book' : 'components'} onPress={() => onOpen(row)}>
      <ListRow.Label>{row.name}</ListRow.Label>
      <ListRow.Hint>
        {`${row.page ? 'Guide' : row.group} · ${latest?.subject ?? 'not committed yet'}`}
      </ListRow.Hint>
      <ListRow.Trailing>
        <Box align="flex-end" gap={2}>
          <Text variant="meta" color={row.entry.dirty ? 'accent' : 'textMuted'} style={s.when}>
            {changedLabel(row)}
          </Text>
          <Text variant="meta" color="textDim" style={s.added}>
            {row.entry.created ? `added ${dayLabel(row.entry.created)}` : 'new'}
          </Text>
        </Box>
      </ListRow.Trailing>
    </ListRow.Root>
  );
}

const changedLabel = (row: HistoryRow): string =>
  row.entry.changed ? agoLabel(row.entry.changed) : 'uncommitted';

function Nothing({ shallow }: Readonly<{ shallow: boolean }>) {
  return (
    <Box p={space[4]} radius="md" bg="surface1" style={s.nothing}>
      <Text variant="meta" color="textDim">
        {shallow
          ? 'This build was made from a shallow clone, which holds only the last few commits. A creation date read from one would be the date of the fetch, so nothing is listed.'
          : 'This build was made outside a git checkout, so there is no history to list.'}
      </Text>
    </Box>
  );
}

const s = styles({
  count: { fontSize: 11 },
  when: { fontSize: 12, fontWeight: '600' },
  added: { fontSize: 11 },
  nothing: { borderWidth: 1, borderColor: 'border' },
});

export { RecentChanges };
