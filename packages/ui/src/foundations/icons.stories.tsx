import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { Icon } from '#ui/components/atoms/icon';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { iconNames } from '#ui/lib/glyph';

// Rendering thousands of glyphs at once locks the workbench up for seconds,
// and far longer on a television.
const PAGE = 120;

export default story({
  name: 'Icons',
  group: 'Foundations',
  docs: 'Every Tabler glyph, by its kebab-case name: `<Icon name="wave-sine" />`. Nothing has to be registered first, and a name that does not exist draws the fallback `help-circle` rather than crashing. Type in `find` to search.',
  usage: `<Icon name="player-play-filled" size={24} color="accentText" />`,
  guidelines: {
    do: [
      'Use the kebab-case Tabler slug: `chevron-right`, `player-pause-filled`.',
      'Pass a palette token to `color`; a raw string is for the few one-off washes.',
    ],
    dont: [
      "Don't thin `stroke` below 1.8 - it disappears at three metres.",
      "Don't ship a name you have not seen render: an unknown one quietly falls back.",
    ],
  },
  matrix: false,
  width: { min: 480, max: 1000 },
  args: { size: 26, find: '' },
  controls: { size: { min: 12, max: 64, step: 2 } },
  render: ({ size, find }) => {
    const needle = String(find).toLowerCase();
    const all = iconNames();
    const matches = needle ? all.filter((name) => name.includes(needle)) : all;
    const shown = matches.slice(0, PAGE);
    return (
      <Box gap={20}>
        <Txt variant="meta" color="textDim">
          {`${matches.length} of ${all.length} glyphs${
            matches.length > shown.length ? `, showing the first ${PAGE}` : ''
          }`}
        </Txt>
        <Box row wrap gap={20}>
          {shown.map((name) => (
            <Box key={name} w={104} align="center" gap={8}>
              <Icon name={name} size={size} />
              <Txt variant="meta" color="textDim" lines={1} style={s.caption}>
                {name}
              </Txt>
            </Box>
          ))}
        </Box>
        {shown.length === 0 ? (
          <Txt variant="meta" color="textDim">
            {`No glyph matches "${find}".`}
          </Txt>
        ) : null}
      </Box>
    );
  },
});

const s = styles({
  caption: { textAlign: 'center' },
});
