import type { Highlight } from '@kromatv/client/releases';
import { Box, IconWell, Text } from '@kromatv/ui/kit';
import { HighlightArt } from '#web/features/releases/highlight-art';

const SHAPE = {
  lead: { gap: 8, px: 26, pt: 22, pb: 26, title: 'h2' },
  card: { gap: 6, px: 18, pt: 16, pb: 20, title: 'cardTitle' },
} as const;

export function HighlightCard({
  highlight,
  lead = false,
}: Readonly<{ highlight: Highlight; lead?: boolean }>) {
  const shape = SHAPE[lead ? 'lead' : 'card'];
  return (
    <Box grow={1} bg="surface1" radius="xl" border="border" overflow="hidden">
      {highlight.image ? <HighlightArt image={highlight.image} /> : null}
      <Box gap={shape.gap} px={shape.px} pt={shape.pt} pb={shape.pb}>
        {highlight.image ? null : (
          <Box mb={4}>
            <IconWell name="sparkles" size="sm" />
          </Box>
        )}
        <Text variant={shape.title}>{highlight.title}</Text>
        <Text variant="body" color="textMuted">
          {highlight.body}
        </Text>
      </Box>
    </Box>
  );
}
