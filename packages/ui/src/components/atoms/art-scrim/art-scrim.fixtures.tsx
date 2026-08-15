import { ArtScrim, type ArtScrimVariant } from '#ui/components/atoms/art-scrim';

import { Box } from '#ui/components/atoms/box';

import { Text } from '#ui/components/atoms/text';

export function Tile({ variant }: Readonly<{ variant?: ArtScrimVariant }>) {
  return (
    <Box aspect={2 / 3} radius="lg" overflow="hidden" bg="accentBright">
      {variant ? <ArtScrim variant={variant} radius="lg" /> : null}
      <Box absolute left={14} right={14} bottom={12}>
        <Text variant="title" color="white">
          Blade Runner 2049
        </Text>
      </Box>
    </Box>
  );
}
