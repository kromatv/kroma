import { Button, Callout, Column, Field, Row, Text } from '@kromatv/ui/kit';
import { useState } from 'react';
import type { MessageTarget } from '../overlay/message-target';
import type { CatalogMessage } from '../server/host';
import { saveMessage } from '../server/message';
import { changedForms, formLabel, messageFields } from './message-fields';

export interface MessageFormProps {
  target: MessageTarget;
  message: CatalogMessage;
  onClose: () => void;
  onSaved: () => void;
}

function named(variables: readonly string[]): string {
  return variables.map((name) => `{${name}}`).join(' ');
}

/** The texts of one message in one locale, and the save that writes back the
 *  ones that moved. The source language's forms sit above as the reference,
 *  unless it is the source language being edited. */
export function MessageForm({ target, message, onClose, onSaved }: Readonly<MessageFormProps>) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const fields = messageFields(target.key, message);
  const changed = changedForms(fields, drafts);
  const translating = target.locale !== message.source;
  const reference = Object.entries(message.reference);

  const save = () => {
    setSaving(true);
    setRefused(null);
    void saveMessage(target, changed).then((reason) => {
      setSaving(false);
      if (reason === null) onSaved();
      else setRefused(reason);
    });
  };

  return (
    <Column gap={12}>
      {translating ? (
        <Column gap={4}>
          <Text variant="meta" color="textMuted">
            {`Source (${message.source})`}
          </Text>
          {reference.map(([form, text]) => (
            <Text key={form} variant="meta" color="textDim">
              {reference.length > 1 ? `${formLabel(target.key, form)}: ${text}` : text}
            </Text>
          ))}
        </Column>
      ) : (
        <Text variant="meta" color="textMuted">
          {`${message.source} is the source language. Saving marks its translations outdated.`}
        </Text>
      )}
      {target.scope !== null && (
        <Text variant="meta" color="textMuted">
          {`This message belongs to ${target.scope}. The page shows a saved text once that module is rebuilt.`}
        </Text>
      )}
      {fields.map((field, at) => (
        <Field.Root
          key={field.form}
          label={field.label}
          size="sm"
          value={drafts[field.form] ?? field.text}
          onValueChange={(text) => setDrafts((current) => ({ ...current, [field.form]: text }))}
        >
          <Field.Textarea rows={2} maxRows={6} physicalKeyboard autoFocus={at === 0} />
        </Field.Root>
      ))}
      {message.variables.length > 0 && (
        <Text variant="meta" font="mono" color="textDim">
          {named(message.variables)}
        </Text>
      )}
      {refused !== null && (
        <Callout.Root tone="danger" size="sm">
          <Callout.Title>{refused}</Callout.Title>
        </Callout.Root>
      )}
      <Row gap={8} justify="flex-end">
        <Button label="Cancel" variant="ghost" size="sm" focusScale={1} onPress={onClose} />
        <Button
          label="Save"
          size="sm"
          focusScale={1}
          disabled={Object.keys(changed).length === 0}
          loading={saving}
          onPress={save}
        />
      </Row>
    </Column>
  );
}
