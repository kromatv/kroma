import { Badge } from '@kromatv/ui/kit/atoms/badge';
import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { TextArea } from '@kromatv/ui/kit/atoms/text-area';
import type { ReactNode } from 'react';
import { MessageIssues } from '#site/components/message-issues.component';
import { SaveState } from '#site/components/save-state.component';
import { isUntranslated } from '#site/lib/row-filter';
import { type MessageTarget, useMessageSave } from '#site/lib/use-message-save.hook';
import type { RowView } from '#site/lib/views';

function Said({ language, text }: Readonly<{ language: string; text: string | null }>) {
  return (
    <Column gap={2}>
      <Text variant="overline" color="textDim">
        {language}
      </Text>
      <Text color={text === null ? 'textDim' : 'textMuted'}>{text ?? 'Not translated'}</Text>
    </Column>
  );
}

function Badges({ row }: Readonly<{ row: RowView }>) {
  return (
    <>
      {row.plural ? <Badge tone="neutral">{`Plural · ${row.plural}`}</Badge> : null}
      {isUntranslated(row) ? <Badge tone="warning">Untranslated</Badge> : null}
      {row.draft !== null && !row.proposed ? <Badge tone="info">Not sent</Badge> : null}
      {row.proposed ? <Badge tone="success">In pull request</Badge> : null}
    </>
  );
}

function Heading({ row }: Readonly<{ row: RowView }>) {
  return (
    <Row gap={8} wrap align="center">
      <Box shrink={1} minW={0}>
        <Text variant="meta" font="mono" color="textDim">
          {row.key}
        </Text>
      </Box>
      <Badges row={row} />
    </Row>
  );
}

function Source({ row, sourceName }: Readonly<{ row: RowView; sourceName: string }>) {
  return (
    <Column gap={10} grow={1} shrink={1} basis={280} minW={0}>
      <Column gap={2}>
        <Text variant="overline" color="textDim">
          {sourceName}
        </Text>
        <Text>{row.source}</Text>
      </Column>
      {row.references.map((reference) => (
        <Said
          key={reference.language.tag}
          language={reference.language.name}
          text={reference.text}
        />
      ))}
    </Column>
  );
}

type MessageSave = ReturnType<typeof useMessageSave>;

function Editor({
  message,
  messageKey,
  linked,
}: Readonly<{ message: MessageSave; messageKey: string; linked: boolean }>) {
  return (
    <TextArea
      autoFocus={linked}
      value={message.value}
      onValueChange={message.setValue}
      onBlur={() => void message.commit()}
      rows={2}
      placeholder="Not translated yet"
      label={`Translation of ${messageKey}`}
      invalid={message.issues.some((issue) => issue.level === 'error')}
    />
  );
}

function Shown({ value }: Readonly<{ value: string }>) {
  return <Text color={value ? 'text' : 'textDim'}>{value || 'Not translated yet'}</Text>;
}

function Translation({
  message,
  children,
}: Readonly<{ message: MessageSave; children: ReactNode }>) {
  return (
    <Column gap={8} grow={1} shrink={1} basis={280} minW={0}>
      {children}
      <MessageIssues issues={message.issues} />
      <SaveState status={message.status} />
    </Column>
  );
}

type MessageRowProps = Readonly<{
  row: RowView;
  target: MessageTarget;
  sourceName: string;
  editable: boolean;
  linked: boolean;
}>;

/** One message to translate: key, source, references, and the viewer's text, saved on blur when `editable`, its field focused when `linked`. */
export function MessageRow({ row, target, sourceName, editable, linked }: MessageRowProps) {
  const message = useMessageSave(row, target);
  return (
    <Box
      nativeID={row.key}
      bg="surface1"
      border={isUntranslated(row) ? 'accent/45' : 'border'}
      radius="lg"
      p={16}
      gap={12}
    >
      <Heading row={row} />
      <Row gap={16} wrap align="flex-start">
        <Source row={row} sourceName={sourceName} />
        <Translation message={message}>
          {editable ? (
            <Editor message={message} messageKey={row.key} linked={linked} />
          ) : (
            <Shown value={message.value} />
          )}
        </Translation>
      </Row>
    </Box>
  );
}
