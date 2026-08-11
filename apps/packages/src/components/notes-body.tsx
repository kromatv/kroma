import { Box, Column, Row } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';

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
    return <Txt variant="label">{line.text}</Txt>;
  }
  if (line.kind === 'bullet') {
    return (
      <Row gap={10} align="flex-start">
        <Txt color="accentText">•</Txt>
        <Box shrink={1}>
          <Txt color="textMuted">{line.text}</Txt>
        </Box>
      </Row>
    );
  }
  return <Txt color="textMuted">{line.text}</Txt>;
}

export function NotesBody({ notes }: Readonly<{ notes: string }>) {
  const lines = parse(notes);
  if (lines.length === 0) {
    return <Txt color="textMuted">This release has no notes.</Txt>;
  }
  return (
    <Column gap={10}>
      {lines.map((line) => (
        <NotesLine key={line.id} line={line} />
      ))}
    </Column>
  );
}
