import { story } from '@kroma/workbench/story';
import { CodeBlock } from './code-block';

const CALL_SITE = `<Table.Root label="Modules">
  <Table.Header>
    <Table.Row>
      <Table.Cell>Module</Table.Cell>
      <Table.Cell>Port</Table.Cell>
    </Table.Row>
  </Table.Header>
</Table.Root>`;

const LONG_LINE = `const player = usePlayer({ source, startAt: 2940, autoplay: true, subtitles: 'fr', audio: 'eng' });`;

const A_FILE = `// The one place shared code asks for the DOM.
import { webWindow } from '#ui/lib/dom';

export function clipboard(): Clipboard | undefined {
  return webWindow()?.navigator?.clipboard;
}

// A television has no clipboard, and nowhere to paste either.
const available = Boolean(clipboard());`;

export default story({
  name: 'CodeBlock',
  group: 'Layout',
  docs: 'A block of TSX, highlighted, numbered and copyable. It paints through <Text> and <Box> rather than through a highlighter, because every highlighter worth having emits HTML and there is no HTML on a television. Code is never wrapped and never truncated - a broken call site reads as a different call site - so a long line scrolls sideways under line numbers that stay put.',
  usage: `<CodeBlock code={source} />

<CodeBlock code={source} numbers={false} maxHeight={180} />`,
  guidelines: {
    do: [
      'Hand it the snippet as it is written: it trims the ends and paints everything in between.',
      'Lower `maxHeight` where the block sits in a dock or a drawer, so it scrolls instead of pushing the rest of the panel out.',
    ],
    dont: [
      "Don't wrap it in a scroller of its own: the block owns both axes.",
      "Don't use it for one word of code inside a sentence - that is an inline mark, not a block.",
    ],
  },
  matrix: false,
  width: { min: 320, max: 720 },
  component: CodeBlock,
  args: { code: CALL_SITE, numbers: true, maxHeight: 320 },
  controls: { maxHeight: { min: 80, max: 480, step: 20 } },
  scenes: [
    {
      name: 'One line',
      docs: 'A single line is not numbered: the gutter would be a column saying "1".',
      example: () => <CodeBlock code={'<Button label="Play" onPress={play} />'} />,
    },
    {
      name: 'A line too long for the block',
      docs: 'The code scrolls sideways rather than wrapping. The numbers sit outside that scroller, so they stay put while the code slides under them.',
      example: () => <CodeBlock code={LONG_LINE} />,
    },
    {
      name: 'Past its height',
      docs: 'The block hugs its content up to `maxHeight`; only past that does it scroll, so a two-line snippet is a two-line block rather than a mostly-empty well.',
      example: () => <CodeBlock code={A_FILE} maxHeight={140} />,
    },
  ],
});
