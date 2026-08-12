import { story } from '@kroma/workbench/story';
import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { tintGradient } from '#ui/components/molecules/media-card';
import { stillArt } from '#ui/lib/sample-art';
import { Frost } from './frost';

const TINT = tintGradient(['#3A2E4F', '#1B1524']);

const CORNER = 20;

// A photograph behind the panel, never a flat fill: a blur over one colour is
// that colour again, and the layer would look like nothing at all.
function OverArt({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Box h={240} radius="lg" overflow="hidden" center px={24}>
      <Img src={stillArt(2)} background={TINT} fill />
      {children}
    </Box>
  );
}

function Panel({ amount, radius }: Readonly<{ amount?: number; radius?: number }>) {
  return (
    <Box px={22} py={16} gap={4} radius={CORNER} bg="surface1/55" border="border">
      {amount === undefined ? null : <Frost amount={amount} radius={radius ?? CORNER} />}
      <Text variant="label">Volume levelling</Text>
      <Text variant="meta" color="textMuted">
        Evens out the loud scenes.
      </Text>
    </Box>
  );
}

export default story({
  name: 'Frost',
  group: 'Layout',
  docs: "The backdrop blur under a glass surface, and the kit's answer to React Native having no backdrop filter. Three behaviours from one call: a browser gets the real CSS `backdrop-filter`; the 2019 TV WebKits ignore that property, so a legacy Tizen or webOS keeps the plain wash rather than compositing a blur on the CPU; and a native target renders whatever blur view the shell handed over at startup (`registerFrost(BlurView)`), or nothing at all if it handed over none. The layer fills its parent, sits below the parent's own content, takes no press, and clips ITSELF to the corner it is given, so the surface never needs `overflow: hidden` - which would also crop the focus rings of the controls inside it. Most screens never write one: `<Surface tone=\"glass\">`, the frosted `<Button>` coats, `<ListRow.Group>` and every field's well lay one down themselves. Slide `radius` below the card's own corner to watch a square blur cut through a rounded panel, which is the one way to get this wrong.",
  usage: `<Box radius="2xl" bg="surface1/55" border="border">
  <Frost radius="2xl" />
  <Text>Volume levelling</Text>
</Box>

// Once, in the shell's entry file, so native frosts at all:
registerFrost(BlurView);`,
  guidelines: {
    do: [
      "Give it the surface's own corner: it clips itself rather than asking the surface to clip its children.",
      'Write it as the first child of the surface it frosts; it fills the box and paints under everything else in it.',
      'Keep the fill above it translucent. The blur is what stops that translucency reading as a hole in the page.',
      'Register the platform blur once in the shell. The kit ships no blur dependency of its own, the same inversion as voice search and the launcher.',
    ],
    dont: [
      "Don't add one to a surface the kit already frosts: a glass <Surface>, a glass or scrim <Button>, a <ListRow.Group>, a <Field.Input>.",
      "Don't count on it: an unregistered native shell and every legacy TV panel show the wash alone, so the surface has to read without the blur.",
      "Don't blur on a television. A backdrop filter is re-paid whenever anything behind it moves, and a 2024 Samsung measured 40fps with it against 60 without.",
      "Don't pass `tint` to force a ground for the look of it: it is the native blur's tint only, does nothing on a browser, and the default already follows the app's ground.",
    ],
  },
  matrix: false,
  width: { min: 320, max: 560 },
  args: { amount: 12, radius: CORNER },
  controls: { amount: { min: 0, max: 40, step: 2 }, radius: { min: 0, max: 40, step: 2 } },
  render: ({ amount, radius }) => (
    <OverArt>
      <Panel amount={amount} radius={radius} />
    </OverArt>
  ),
  scenes: [
    {
      name: 'Where there is no blur',
      docs: 'The same panel with no layer under it, which is exactly what a legacy TV WebKit and a native shell that never called `registerFrost` draw. The photograph shows through the fill unblurred, so a caption sitting on it competes with whatever is behind. This is the case that decides how opaque the fill above a frost is allowed to be.',
      example: () => (
        <OverArt>
          <Panel />
        </OverArt>
      ),
    },
  ],
});
