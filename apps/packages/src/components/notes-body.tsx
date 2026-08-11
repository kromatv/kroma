import { Box, Column, Row } from '@kroma/ui/kit/atoms/box';
import { Text } from '@kroma/ui/kit/atoms/text';

interface Line {
  id: string;
  kind: 'heading' | 'bullet' | 'text';
  text: string;
}

const strip = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');

function parse(notes: string): Line[] {
  const out: Line[] = [];
  for (const raw of notes.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const id = `line-${out.length}`;
    const heading = /^#{1,6}\s+(\S.*)?$/.exec(line)?.[1];
    if (heading) {
      out.push({ id, kind: 'heading', text: strip(heading) });
      continue;
    }
    const bullet = /^[*-]\s+(\S.*)?$/.exec(line)?.[1];
    if (bullet) {
      out.push({ id, kind: 'bullet', text: strip(bullet) });
      continue;
    }
    out.push({ id, kind: 'text', text: strip(line) });
  }
  return out;
}

function NotesLine({ line }: Readonly<{ line: Line }>) {
  if (line.kind === 'heading') {
    return <Text variant="label">{line.text}</Text>;
  }
  if (line.kind === 'bullet') {
    return (
      <Row gap={10} align="flex-start">
        <Text color="accentText">•</Text>
        <Box shrink={1}>
          <Text color="textMuted">{line.text}</Text>
        </Box>
      </Row>
    );
  }
  return <Text color="textMuted">{line.text}</Text>;
}

export function NotesBody({ notes }: Readonly<{ notes: string }>) {
  const lines = parse(notes);
  if (lines.length === 0) {
    return <Text color="textMuted">This release has no notes.</Text>;
  }
  return (
    <Column gap={10}>
      {lines.map((line) => (
        <NotesLine key={line.id} line={line} />
      ))}
    </Column>
  );
}
