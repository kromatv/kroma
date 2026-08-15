export const CALL_SITE = `<Table.Root label="Modules">
  <Table.Header>
    <Table.Row>
      <Table.Cell>Module</Table.Cell>
      <Table.Cell>Port</Table.Cell>
    </Table.Row>
  </Table.Header>
</Table.Root>`;

export const LONG_LINE = `const player = usePlayer({ source, startAt: 2940, autoplay: true, subtitles: 'fr', audio: 'eng' });`;

export const A_FILE = `// The one place shared code asks for the DOM.
import { webWindow } from '#ui/lib/dom';

export function clipboard(): Clipboard | undefined {
  return webWindow()?.navigator?.clipboard;
}

// A television has no clipboard, and nowhere to paste either.
const available = Boolean(clipboard());`;
