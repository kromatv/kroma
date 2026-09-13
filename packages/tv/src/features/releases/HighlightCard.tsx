import type { Highlight } from '@kromatv/client/releases';
import { Box, Icon, Img } from '@kromatv/ui/kit';

const MARK = 96;
const MARK_RADIUS = 28;
const MARK_GLYPH = 44;

export function HighlightCard({
  highlight,
  width,
}: Readonly<{ highlight: Highlight; width: number }>) {
  return (
    <Box w={width} aspect={16 / 9} radius="xl" shadow="pop">
      <Box fill center radius="xl" overflow="hidden" bg="surface1" border="border">
        {highlight.image ? (
          <Img src={highlight.image.url} alt={highlight.image.alt} radius="xl" fill />
        ) : (
          <HighlightMark />
        )}
      </Box>
    </Box>
  );
}

export function HighlightMark() {
  return (
    <Box w={MARK} h={MARK} radius={MARK_RADIUS} bg="surface2" center>
      <Icon name="sparkles" size={MARK_GLYPH} color="accent" thickness={1.7} />
    </Box>
  );
}
