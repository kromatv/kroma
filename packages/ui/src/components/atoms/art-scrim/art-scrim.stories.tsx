import { story } from '@kroma/workbench/story';
import { ArtScrim, type ArtScrimVariant } from '#ui/components/atoms/art-scrim';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';

export default story({
  name: 'ArtScrim',
  group: 'Media',
  docs: 'The fade every tile lays over its artwork so the caption on it survives bright key art. Two ramps: `soft` leaves the picture alone until the bottom third, `deep` is already dark under a title that sits ON the art. The pale amber standing in for artwork here is the worst case a scrim has to work against.',
  usage: `<Box aspect={16 / 9} radius="xl" overflow="hidden">
  <Img src={art} background={tintGradient(tint)} radius={16} fill />
  <ArtScrim variant="soft" radius="xl" />
  <Box absolute left={18} right={18} bottom={16}>
    <Text>{title}</Text>
  </Box>
</Box>`,
  guidelines: {
    do: [
      'Give it the same corner as the tile it fills: the layer rounds itself, because Chrome will not clip a composited descendant to the parent.',
      'Reach for `deep` when the caption sits ON the art, and for `soft` when it only has to keep a badge readable.',
    ],
    dont: [
      "Don't stack a second scrim over it to darken a tile; pick the deeper ramp.",
      "Don't use it as a page veil. It fades to the artwork, not to the page ground.",
    ],
  },
  matrix: false,
  width: { min: 240, max: 380 },
  args: { variant: 'soft' as ArtScrimVariant },
  controls: { variant: ['soft', 'deep'] },
  render: ({ variant }) => <Tile variant={variant} />,
  scenes: [
    {
      name: 'Bare artwork',
      docs: 'The same tile with no scrim at all, which is what the ramps are measured against: pale key art and a white title are unreadable together.',
      example: () => <Tile />,
    },
  ],
});

function Tile({ variant }: Readonly<{ variant?: ArtScrimVariant }>) {
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
