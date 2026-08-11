import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { Avatar } from './avatar';

const NAMES = ['Marie Curie', 'jean.dupont', 'ada_lovelace', 'Alan Turing'];

const SHAPES = [
  { label: '0 · square', props: { roundness: 0 } },
  { label: '0.16 · default', props: {} },
  { label: '0.33', props: { roundness: 0.33 } },
  { label: 'circle · 0.5', props: { circle: true } },
] as const;

const SIZES = [40, 64, 96, 140];

export default story({
  name: 'Avatar',
  group: 'Brand',
  docs: 'Initials on a gradient picked deterministically from the seed, so a profile keeps its colors from one device to the next without anything being stored.\n\nThe corner is a RATIO of the size (`roundness`, 0.16 by default), not a pixel radius: everything else about an avatar already scales with `size`, so one value keeps the same shape from a 26px list row to a 140px picker tile. `circle` is the shorthand for the full disc, and the padlock badge is inset from the resulting corner, so it lands inside the shape rather than being cropped by it.',
  usage: `<Avatar name="Marie Curie" size={96} />
<Avatar name="Marie Curie" circle locked />
<Avatar name="Marie Curie" roundness={0.33} />`,
  guidelines: {
    do: [
      'Use `circle` for a profile or a cast member - a person is a disc, a title is a rounded rectangle.',
      'Pass a stable `seed` (the user id) so a profile keeps its colour on every screen.',
    ],
    dont: [
      "Don't reach for a pixel radius: a 24px corner is a squircle at 48 and a barely-softened box at 200.",
      "Don't hand it a pre-cropped square photo - it clips the art to the corner itself.",
    ],
  },
  matrix: false,
  args: {
    name: 'Marie Curie',
    seed: 'a',
    size: 96,
    roundness: 0.16,
    circle: false,
    locked: false,
    shadow: false,
  },
  controls: {
    size: { min: 32, max: 200, step: 8 },
    roundness: { min: 0, max: 0.5, step: 0.02 },
  },
  render: (props) => <Avatar {...props} />,
  scenes: [
    {
      name: 'A team',
      render: (props) => (
        <Box row gap={20} align="center">
          {NAMES.map((name, index) => (
            <Avatar {...props} key={name} name={name} seed={String(index)} />
          ))}
        </Box>
      ),
    },
    {
      name: 'Shapes',
      docs: 'From a square to the full disc. Every one carries the padlock, which is where the corner used to crop it.',
      render: ({ size, name, seed }) => (
        <Box row gap={26} align="center">
          {SHAPES.map((shape) => (
            <Box key={shape.label} align="center" gap={10}>
              <Avatar name={name} seed={seed} size={size} locked {...shape.props} />
              <Text variant="meta" color="textDim">
                {shape.label}
              </Text>
            </Box>
          ))}
        </Box>
      ),
    },
    {
      name: 'One roundness, every size',
      docs: 'The same `roundness` at four sizes: the corner grows with the disc, so a profile is the same shape in a list row and in the picker. A pixel radius could only be right at one of these.',
      render: ({ name, seed, roundness }) => (
        <Box row gap={24} align="flex-end">
          {SIZES.map((size) => (
            <Box key={size} align="center" gap={10}>
              <Avatar name={name} seed={seed} size={size} roundness={roundness} />
              <Text variant="meta" color="textDim">
                {size}
              </Text>
            </Box>
          ))}
        </Box>
      ),
    },
  ],
});
