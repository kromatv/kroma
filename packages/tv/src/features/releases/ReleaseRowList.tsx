import { useT } from '@kromatv/ui';
import { FocusColumn, type IconName, ListRow, styles, Text } from '@kromatv/ui/kit';
import { type ReleaseRow, rowLabel } from '#tv/features/releases/releaseRows';

export const ROW_ICON = {
  highlight: 'sparkles',
  fixed: 'check',
  owner: 'server',
} as const satisfies Record<ReleaseRow['kind'], IconName>;

const s = styles({ rows: { gap: 12, mt: 36 } });

/** Focusing a row is what picks it. */
export function ReleaseRowList({
  rows,
  picked,
  onPick,
}: Readonly<{ rows: readonly ReleaseRow[]; picked: number; onPick: (at: number) => void }>) {
  const t = useT();
  return (
    <FocusColumn style={s.rows}>
      {rows.map((row, at) => (
        <ListRow.Root
          // biome-ignore lint/suspicious/noArrayIndexKey: a row is its slot, so the focused one outlives a change of version.
          key={at}
          icon={ROW_ICON[row.kind]}
          autoFocus={at === 0}
          chevron={false}
          role="option"
          selected={at === picked}
          onFocus={() => onPick(at)}
          onPress={() => onPick(at)}
        >
          <ListRow.Label>{rowLabel(row, t)}</ListRow.Label>
          {row.kind === 'highlight' ? null : (
            <ListRow.Trailing>
              <Text variant="labelTv" color="accentText">
                {row.lines.length}
              </Text>
            </ListRow.Trailing>
          )}
        </ListRow.Root>
      ))}
    </FocusColumn>
  );
}
