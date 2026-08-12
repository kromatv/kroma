import { story } from '@kroma/workbench/story';
import { Box } from '#ui/components/atoms/box';
import { HINT_KEYS, Hint } from './hint';

export default story({
  name: 'Hint',
  group: 'Feedback',
  docs: "The line that tells you what the remote does. The translation carries only the WORDS, with `{left}`-style tokens where a key belongs, and those become real glyphs from the kit's own set at the text's size and colour. The alternative — geometric characters typed into the translation — put part of the interface inside a string a translator edits, and tvOS rendered several of those code points as blue **emoji**.",
  usage: `<Hint text={t('profiles.navHint')} />
// "profiles.navHint": "{left} {right} Browse · OK Select"`,
  guidelines: {
    do: [
      'Put the tokens in the translation so word order stays with the translator.',
      'Leave it at the default size and colour: a hint is secondary by definition.',
    ],
    dont: [
      "Don't type ◀ or ▶ into a translation - that is what the tokens exist to stop.",
      "Don't explain more than two keys in one line; nobody reads the third.",
    ],
  },
  matrix: false,
  component: Hint,
  args: {
    text: '{left} {right} Browse · OK Select · {back} Back',
    size: 15,
  },
  controls: { size: { min: 11, max: 28, step: 1 } },
  scenes: [
    {
      name: 'Every key',
      docs: 'All seven tokens a hint can name, each drawing its glyph from the icon set.',
      render: ({ size }) => (
        <Box gap={10}>
          {Object.keys(HINT_KEYS).map((key) => (
            <Hint key={key} size={size} text={`{${key}}  ${key}`} />
          ))}
        </Box>
      ),
    },
    {
      name: 'Playback',
      args: { text: '{play} Play · {pause} Pause · {back} Back' },
    },
  ],
});
