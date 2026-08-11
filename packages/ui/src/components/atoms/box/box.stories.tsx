import { story } from '@kroma/workbench/story';
import { Text } from '#ui/components/atoms/text';
import { Box } from './box';

export default story({
  name: 'Box',
  group: 'Layout',
  docs: "The layout atom, and the most-used component in the kit. React Native has no `className`, and a screen written as a StyleSheet lookup table reads terribly, so `<Box>` takes the design's vocabulary as props instead. Sizes are plain **numbers** on purpose: every TV screen is authored against the fixed 1920x1080 stage, so a number IS the design's px value. Only what genuinely is a token — colour, radius, elevation — takes a token name.",
  usage: `<Box row center gap={12} px={64} py={24} bg="surface1" radius="lg" flex>
  <Text>Anything</Text>
</Box>`,
  guidelines: {
    do: [
      'Reach for `row`, `center`, `gap` before writing a `style` at all.',
      'Use a token name for `bg`, `radius` and `shadow`; a raw string only for a one-off wash.',
    ],
    dont: [
      "Don't add a viewport unit: the stage is a fixed 1920x1080, so `82` is the answer, not `7.6vh`.",
      "Don't reach past it to a bare `View` for layout - the shorthand is the house style.",
    ],
  },
  matrix: false,
  args: {
    row: true,
    gap: 12,
    p: 20,
    radius: 'lg',
    bg: 'surface1',
    center: false,
  },
  controls: {
    radius: ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'pill'],
    bg: ['bg', 'surface1', 'surface2', 'accentSoft'],
    gap: { min: 0, max: 48, step: 4 },
    p: { min: 0, max: 64, step: 4 },
  },
  render: ({ radius, bg, ...props }) => (
    <Box {...props} radius={radius as 'lg'} bg={bg as 'surface1'}>
      {['One', 'Two', 'Three'].map((label) => (
        <Box key={label} px={16} py={10} radius="md" bg="surface2">
          <Text variant="meta">{label}</Text>
        </Box>
      ))}
    </Box>
  ),
  scenes: [
    {
      name: 'Centred column',
      docs: 'The same three children, stacked and centred: `row` off, `center` on.',
      args: { row: false, center: true, p: 32 },
    },
  ],
});
