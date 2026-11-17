import { Box, Column, Row } from '@kromatv/ui/kit/atoms/box';
import { Text } from '@kromatv/ui/kit/atoms/text';
import { useContext, useEffect } from 'react';
import { HighlightedField } from '#site/components/highlighted-field.component';
import { MessageIssues } from '#site/components/message-issues.component';
import { PlaceableText, VariablesLine } from '#site/components/placeable.component';
import { SaveState } from '#site/components/save-state.component';
import { fieldOf, focusField } from '#site/lib/field-dom';
import { nextMissing, type Variable, variablesOf } from '#site/lib/placeables';
import { pluralExamples } from '#site/lib/plural-examples';
import { EditorFields } from '#site/lib/use-editor-keys.hook';
import { useFieldInsert } from '#site/lib/use-field-insert.hook';
import { type MessageTarget, useMessageSave } from '#site/lib/use-message-save.hook';
import type { RowView } from '#site/lib/views';

const TOKEN_ISSUES = new Set(['unknown-token', 'missing-token']);

const variablesId = (key: string) => `variables:${key}`;

type Insert = ((value: string) => void) | undefined;
type Message = ReturnType<typeof useMessageSave>;
type Entry = ReturnType<typeof useFieldInsert>;

/** What a form of a message is about: the row, where it saves, whether the viewer may edit it, whether a link named it, and who to tell when its field takes or leaves the focus. */
export interface FormProps {
  row: RowView;
  target: MessageTarget;
  editable: boolean;
  linked: boolean;
  onFocusChange: (focused: boolean) => void;
}

function FormName({ row, locale }: Readonly<{ row: RowView; locale: string }>) {
  if (row.plural === null) {
    return null;
  }
  const examples = pluralExamples(locale, row.plural);
  return (
    <Row gap={6} align="center">
      <Text variant="overline" color="accentText">
        {row.plural}
      </Text>
      {examples ? (
        <Text variant="meta" color="textDim">
          {`e.g. ${examples}`}
        </Text>
      ) : null}
    </Row>
  );
}

function References({ row, onInsert }: Readonly<{ row: RowView; onInsert: Insert }>) {
  const look = {
    variant: 'meta',
    color: 'textMuted',
    plural: row.plural !== null,
    onInsert,
  } as const;
  return row.references.flatMap(({ language, text }) =>
    text === null
      ? []
      : [
          <Row key={language.tag} gap={6} align="flex-start">
            <Text variant="meta" color="textDim">
              {language.tag}
            </Text>
            <Box shrink={1} minW={0}>
              <PlaceableText text={text} look={look} />
            </Box>
          </Row>,
        ],
  );
}

function Said({ row, onInsert }: Readonly<{ row: RowView; onInsert: Insert }>) {
  return (
    <Column gap={6} grow={1} shrink={1} basis={{ base: 'auto', md: 0 }} minW={0}>
      <PlaceableText text={row.source} look={{ plural: row.plural !== null, onInsert }} />
      <References row={row} onInsert={onInsert} />
    </Column>
  );
}

function useFieldActions(form: FormProps, insertMissing: () => void): void {
  const fields = useContext(EditorFields);
  const { key } = form.row;
  useEffect(() => {
    fields.set(key, insertMissing);
    return () => {
      fields.delete(key);
    };
  });
  useEffect(() => {
    const field = form.linked ? fieldOf(key) : null;
    if (field) {
      focusField(field);
    }
  }, [key, form.linked]);
}

function ReadOnly({ row, value }: Readonly<{ row: RowView; value: string }>) {
  const look = { plural: row.plural !== null, color: value ? 'textMuted' : 'textDim' } as const;
  return <PlaceableText text={value || 'Not translated yet'} look={look} />;
}

function Field({
  form,
  message,
  entry,
}: Readonly<{ form: FormProps; message: Message; entry: Entry }>) {
  const { row, onFocusChange } = form;
  const wiring = {
    row,
    value: message.value,
    invalid: message.issues.some((issue) => issue.level === 'error'),
    describedBy: variablesId(row.key),
    onValueChange: message.setValue,
    onFocus: () => onFocusChange(true),
    onBlur: () => {
      entry.remember();
      onFocusChange(false);
      void message.commit();
    },
  };
  return <HighlightedField wiring={wiring} />;
}

function FieldStatus({
  form,
  message,
  variables,
  onInsert,
}: Readonly<{
  form: FormProps;
  message: Message;
  variables: Variable[];
  onInsert: (value: string) => void;
}>) {
  return (
    <Row gap={10} wrap between align="center">
      {form.editable ? (
        <VariablesLine id={variablesId(form.row.key)} variables={variables} onInsert={onInsert} />
      ) : null}
      <SaveState status={message.status} />
    </Row>
  );
}

function Translation({
  form,
  message,
  entry,
}: Readonly<{ form: FormProps; message: Message; entry: Entry }>) {
  const variables = variablesOf(form.row.source, message.value, {
    plural: form.row.plural !== null,
  });
  const missing = nextMissing(variables);
  useFieldActions(form, () => (missing ? entry.insert(missing.value) : undefined));
  return (
    <Column gap={6} grow={1} shrink={1} basis={{ base: 'auto', md: 0 }} minW={0}>
      {form.editable ? (
        <Field form={form} message={message} entry={entry} />
      ) : (
        <ReadOnly row={form.row} value={message.value} />
      )}
      <FieldStatus form={form} message={message} variables={variables} onInsert={entry.insert} />
      <MessageIssues issues={message.issues.filter((issue) => !TOKEN_ISSUES.has(issue.code))} />
    </Column>
  );
}

/**
 * One form of a message: its source and the stable translations under it,
 * then the viewer's text, beside them on a wide screen. Placeholders show as
 * chips that insert themselves; Alt+V inserts the next one missing.
 */
export function MessageForm({ form }: Readonly<{ form: FormProps }>) {
  const { row } = form;
  const message = useMessageSave(row, form.target);
  const entry = useFieldInsert(row.key, message.value, message.setValue);
  return (
    <Box nativeID={row.key} dataSet={{ message: row.key }} gap={8}>
      <FormName row={row} locale={form.target.locale} />
      <Box
        row={{ base: false, md: true }}
        gap={{ base: 10, md: 20 }}
        align={{ base: 'stretch', md: 'flex-start' }}
      >
        <Said row={row} onInsert={form.editable ? entry.insert : undefined} />
        <Translation form={form} message={message} entry={entry} />
      </Box>
    </Box>
  );
}
