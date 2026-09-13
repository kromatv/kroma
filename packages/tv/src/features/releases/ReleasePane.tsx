import type { Highlight } from '@kromatv/client/releases';
import { useT } from '@kromatv/ui';
import { Box, Icon, Text } from '@kromatv/ui/kit';
import { HighlightCard, HighlightMark } from '#tv/features/releases/HighlightCard';
import { ROW_ICON } from '#tv/features/releases/ReleaseRowList';
import { type ReleaseRow, rowLabel } from '#tv/features/releases/releaseRows';

const PANE = { left: 840, top: 190, width: 1016 };

export function ReleasePane({ row }: Readonly<{ row: ReleaseRow }>) {
  return (
    <Box absolute left={PANE.left} top={PANE.top} w={PANE.width}>
      {row.kind === 'highlight' ? (
        <HighlightPane highlight={row.highlight} />
      ) : (
        <LinesPane row={row} />
      )}
    </Box>
  );
}

function HighlightPane({ highlight }: Readonly<{ highlight: Highlight }>) {
  return (
    <>
      {highlight.image ? (
        <HighlightCard highlight={highlight} width={PANE.width} />
      ) : (
        <HighlightMark />
      )}
      <Text variant="headingTv" mt={28}>
        {highlight.title}
      </Text>
      <Text variant="bodyTv" color="text/82" maxW={900} mt={12}>
        {highlight.body}
      </Text>
    </>
  );
}

function LinesPane({ row }: Readonly<{ row: Extract<ReleaseRow, { lines: readonly string[] }> }>) {
  const t = useT();
  return (
    <Box px={40} py={36} radius="2xl" bg="surface1" border="border">
      <Text variant="headingTv">{rowLabel(row, t)}</Text>
      <Box mt={24} gap={18}>
        {row.lines.map((line) => (
          <Box key={line} row gap={16}>
            <Box mt={3}>
              <Icon
                name={ROW_ICON[row.kind]}
                size={24}
                color={row.kind === 'fixed' ? 'success' : 'glyph'}
              />
            </Box>
            <Box flex>
              <Text variant="bodyTv" color="text/82">
                {line}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
