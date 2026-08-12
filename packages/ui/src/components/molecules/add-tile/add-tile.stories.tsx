import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { AddTile, addTileVariants } from './add-tile';

// The tile is built to sit over artwork, so the story puts it there: on a flat
// panel a ghost outline looks fine, which is exactly how the bare version
// survived three clients before anyone noticed it vanishing on a bright frame.
const ART =
  'url(https://picsum.photos/seed/kroma-gate/1280/720) center / cover, linear-gradient(#1a1a20, #0a0a0c)';

function OverArt({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Box row center gap={34} p={40} radius="xl" style={{ backgroundImage: ART } as object}>
      {children}
    </Box>
  );
}

export default story({
  name: 'AddTile',
  group: 'Media',
  docs: 'The trailing "one more" slot of a tile row - add a profile, add a server. A dashed square with a plus and its caption, as **one control**: a single focus stop, one hit area, and the caption doubles as the accessible name so the two cannot drift apart.\n\nIt is a **real glass tile, not a ghost outline**. These rows sit over the sign-in artwork, where a bare dashed border disappears against a bright frame - so the well takes the same translucent fill, blur and lift every other control wears, and the dashes read against that instead of against whatever the splash is showing.\n\nThe plus is drawn in a **solid** ink rather than an alpha: it is two crossing strokes, and a translucent colour double-paints where they overlap into a brighter knot at the centre.',
  usage: `<AddTile
  label={t('profiles.addProfile')}
  onPress={() => nav.go('addProfile')}
/>`,
  guidelines: {
    do: [
      'Put it last in the row it adds to, so focus reaches it after the real tiles.',
      'Use `size="md"` on a phone and the default `tv` at ten feet - they match the profile tiles beside them.',
      'Give it the same caption you would give the destination ("Add a profile"), since that caption is the accessible name.',
    ],
    dont: [
      "Don't wrap it in your own pressable - it is already the control, and a second one steals the focus stop.",
      "Don't put it on an opaque panel expecting the ghost look; the fill is deliberate.",
    ],
  },
  variants: addTileVariants,
  args: { label: 'Add a profile', icon: 'plus' as 'plus' | 'server' | 'device-tv' },
  controls: { icon: ['plus', 'server', 'device-tv'] },
  render: (props) => (
    <OverArt>
      <AddTile {...props} onPress={() => {}} />
    </OverArt>
  ),
});
