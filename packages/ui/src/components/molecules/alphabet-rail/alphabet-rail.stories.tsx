import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { AlphabetRail } from './alphabet-rail';

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const AVAILABLE = new Set([...'ABCDEGHILMNOPRSTVWYZ', '#']);

export default story({
  name: 'AlphabetRail',
  group: 'Actions',
  docs: 'The NavPill turned vertical: a fast-scroll rail for a long alphabetical list. The **amber lens** covers every letter whose section is on screen (a tall viewport shows several at once) and travels with the scroll; scrubbing along the rail shows a bubble naming the letter under the finger and jumps as it crosses rows. Letters the list does not carry render dimmed and snap to their nearest present neighbour. The host owns the list and the scroll: the rail only reports jumps.',
  usage: `<AlphabetRail
  letters={TITLE_LETTERS}
  available={lettersInView}
  range={visible}            // {first, last}: the sections on screen
  onJump={scrollToLetter}
  label={t('browse.letterNav')}
  letterLabel={(letter) => t('browse.jumpToLetter', { letter })}
/>`,
  guidelines: {
    do: [
      'Feed `range` from a scroll-spy so the lens mirrors the viewport, not just one letter.',
      'Snap jumps for absent letters to the nearest present one - the rail already renders them dimmed.',
    ],
    dont: [
      "Don't mount it for a short list; under a couple of screens of content it is noise.",
      "Don't scroll smoothly during a scrub; the finger sets the pace, the page keeps up.",
    ],
  },
  render: () => (
    <Box row gap={40} p={20}>
      <AlphabetRail
        letters={LETTERS}
        available={AVAILABLE}
        range={{ first: 'W', last: 'Z' }}
        onJump={() => {}}
        label="Alphabetical navigation"
        letterLabel={(letter) => `Jump to ${letter}`}
      />
      <AlphabetRail
        letters={LETTERS}
        available={AVAILABLE}
        range={{ first: 'C', last: 'E' }}
        onJump={() => {}}
        label="Alphabetical navigation"
        letterLabel={(letter) => `Jump to ${letter}`}
      />
    </Box>
  ),
});
