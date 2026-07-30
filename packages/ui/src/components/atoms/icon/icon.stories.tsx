import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { DEFAULT_ICON_SIZE, DEFAULT_ICON_STROKE, hasGlyph, type IconName } from '#ui/lib/glyph';
import { Icon } from './icon';

// The glyphs the apps actually reach for, so the sheet below is a tour of the
// design rather than a dump of six thousand icons.
const IN_USE: IconName[] = [
  'player-play',
  'player-pause',
  'player-track-next',
  'rewind-backward-10',
  'rewind-forward-10',
  'volume',
  'volume-off',
  'badge-cc',
  'settings',
  'picture-in-picture',
  'maximize',
  'search',
  'home',
  'device-tv',
  'download',
  'star',
  'check',
  'x',
  'chevron-right',
  'mood-empty',
];

const SIZES = [16, 20, DEFAULT_ICON_SIZE, 28, 36, 48];

// Wrong on purpose - a typo and a name a server-installed module might invent
// - so they are cast rather than typed: `IconName` exists precisely to make
// `<Icon name="chevron-rihgt" />` fail to compile, and this is the one place
// that has to opt out of it.
const UNKNOWN = ['chevron-rihgt', 'glyph-from-a-module'] as unknown as IconName[];

// A control's value arrives as an unknown; anything that is not a real glyph
// falls back on render anyway, so this only has to satisfy the type.
const asName = (value: unknown, fallback: IconName): IconName => {
  const name = typeof value === 'string' ? value : '';
  return hasGlyph(name) ? name : fallback;
};

export default story({
  name: 'Icon',
  group: 'Foundations',
  docs: 'Any Tabler glyph (`tabler.io/icons`), by name. There is no registry to add to and no generated file: `wave-sine` draws because Tabler exports `IconWaveSine`, and the name is translated into the export. A name the package does not have draws `help-circle` instead of crashing, which is what makes it safe to take an icon name from **data** - a server-installed module names its glyph in its own manifest, and no list could ever be complete.\n\nThis story is the component: sizes, weight, colour, and what an unknown name does. For **which glyphs exist**, the searchable catalogue is `Foundations / Icons`.',
  usage: `<Icon name="player-play" />
<Icon name="volume" size={20} color="textDim" />
<Icon name="settings" stroke={1.8} />`,
  guidelines: {
    do: [
      'Pass a palette token to `color`: a glyph is told its colour explicitly, because React Native has no `currentColor` to inherit.',
      `Leave \`size\` at ${DEFAULT_ICON_SIZE} unless the layout needs otherwise - it is Tabler's native grid, so the default needs no scaling.`,
    ],
    dont: [
      "Don't wrap it to make it pressable - that is `IconButton`, which owns the hit area and the focus ring.",
      "Don't hard-code a hex where a token exists; the glyph then misses a palette change.",
    ],
  },
  matrix: false,
  // For the sheets below: they wrap, so they need to be told how much room they
  // have. The cells inside keep a width - that is the grid's pitch, not a
  // layout guess - but how many fit on a line follows the canvas.
  width: { min: 360, max: 760 },
  args: {
    name: 'player-play',
    size: DEFAULT_ICON_SIZE,
    stroke: DEFAULT_ICON_STROKE,
    color: 'text',
  },
  controls: {
    name: 'icon',
    size: { min: 12, max: 64, step: 2 },
    stroke: { min: 1, max: 3, step: 0.1 },
    color: ['text', 'textDim', 'accent', 'danger', 'success'],
  },
  render: ({ name, size, stroke, color }) => (
    <Icon name={asName(name, 'player-play')} size={size} stroke={stroke} color={color} />
  ),
  scenes: [
    {
      name: 'In use',
      docs: 'The glyphs the TV, web and mobile apps draw today.',
      render: ({ size, color }) => (
        <Box row wrap gap={18} align="center">
          {IN_USE.map((name) => (
            <Box key={name} align="center" gap={6} w={76}>
              <Icon name={name} size={size} color={color} />
              <Txt variant="overline" color="textDim">
                {name}
              </Txt>
            </Box>
          ))}
        </Box>
      ),
    },
    {
      name: 'Sizes',
      docs: `The outline weight is a prop rather than a scaled stroke, so a glyph keeps the same optical weight at every size. ${DEFAULT_ICON_SIZE} is the default.`,
      render: ({ color, stroke }) => (
        <Box row gap={24} align="flex-end">
          {SIZES.map((size) => (
            <Box key={size} align="center" gap={8}>
              <Icon name="player-play" size={size} stroke={stroke} color={color} />
              <Txt variant="meta" color="textDim">
                {size}
              </Txt>
            </Box>
          ))}
        </Box>
      ),
    },
    {
      name: 'A name it does not have',
      docs: 'An unknown name draws the fallback rather than throwing, so a glyph named by data can never take a screen down. The two on the left are real; the two on the right are not, and both land on `help-circle`.',
      render: ({ stroke }) => (
        <Box row gap={26} align="flex-start">
          {[...IN_USE.slice(0, 2), ...UNKNOWN].map((name, at) => (
            <Box key={name} align="center" gap={8} w={140}>
              <Icon name={name} size={34} stroke={stroke} color={at < 2 ? 'text' : 'textDim'} />
              <Txt variant="meta" color={at < 2 ? 'textDim' : 'danger'}>
                {name}
              </Txt>
            </Box>
          ))}
        </Box>
      ),
    },
  ],
});
