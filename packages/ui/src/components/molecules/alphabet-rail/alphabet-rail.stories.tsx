import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { AlphabetRail } from './alphabet-rail';

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const AVAILABLE = new Set([...'ABCDEGHILMNOPRSTVWYZ', '#']);

export default story({
  name: 'AlphabetRail',
  group: 'Actions',
  docs: 'The NavPill turned vertical: a fast-scroll rail for a long alphabetical list. The **amber lens** covers every letter whose section is on screen (a tall viewport shows several at once) and travels with the scroll; scrubbing along the rail shows a bubble naming the letter under the finger and jumps as it crosses rows. A letter the list does not carry is `disabled`: it renders dimmed, takes no focus stop, and a scrub or tap near it snaps to its nearest present neighbour. The host owns the list and the scroll: the rail only reports jumps.',
  usage: `<AlphabetRail.Root
  letters={TITLE_LETTERS}
  available={lettersInView}
  range={visible}            // {first, last}: the sections on screen
  onJump={scrollToLetter}
  label={t('browse.letterNav')}
  letterLabel={(letter) => t('browse.jumpToLetter', { letter })}
/>

<AlphabetRail.Root label="A-Z" range={visible} onJump={scrollToLetter}>
  <AlphabetRail.Item value="#" label="Jump to #" />
  <AlphabetRail.Item value="A" label="Jump to A" />
  <AlphabetRail.Item value="B" disabled />
</AlphabetRail.Root>`,
  guidelines: {
    do: [
      'Feed `range` from a scroll-spy so the lens mirrors the viewport, not just one letter.',
      'Reach for the `letters` + `available` sugar for a whole alphabet, and for the items only when the buckets are not one flat list.',
    ],
    dont: [
      "Don't mount it for a short list; under a couple of screens of content it is noise.",
      "Don't scroll smoothly during a scrub; the finger sets the pace, the page keeps up.",
    ],
  },
  render: () => (
    <Box row gap={40} p={20}>
      {/* Sugar: one prop per parallel fact, for the whole alphabet. */}
      <AlphabetRail.Root
        letters={LETTERS}
        available={AVAILABLE}
        range={{ first: 'W', last: 'Z' }}
        onJump={() => {}}
        label="Alphabetical navigation"
        letterLabel={(letter) => `Jump to ${letter}`}
      />
      {/* Composed: each bucket written once, present or dimmed. */}
      <AlphabetRail.Root
        label="Alphabetical navigation"
        range={{ first: 'C', last: 'E' }}
        onJump={() => {}}
      >
        {LETTERS.map((letter) => (
          <AlphabetRail.Item
            key={letter}
            value={letter}
            disabled={!AVAILABLE.has(letter)}
            label={`Jump to ${letter}`}
          />
        ))}
      </AlphabetRail.Root>
    </Box>
  ),
});
