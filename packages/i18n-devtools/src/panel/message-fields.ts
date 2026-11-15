import type { CatalogMessage } from '../server/host';

interface MessageField {
  readonly form: string;
  readonly label: string;
  readonly text: string;
}

const WHOLE = 'Text';

/** What to call one form of `key`: the plural variant it is, `one` or
 *  `seats_other`, and `Text` for the key itself. */
export function formLabel(key: string, form: string): string {
  return form.startsWith(`${key}_`) ? form.slice(key.length + 1) : WHOLE;
}

/**
 * The fields to edit `key` through: one per form the locale writes, a plural
 * variant being a form of its own. A locale that writes none yet is offered the
 * source language's forms, empty.
 */
export function messageFields(key: string, message: CatalogMessage): MessageField[] {
  const own = Object.keys(message.forms);
  const forms = own.length > 0 ? own : Object.keys(message.reference);
  return forms.map((form) => ({
    form,
    label: formLabel(key, form),
    text: message.forms[form] ?? '',
  }));
}

/** The texts of `drafts` that no longer say what their field did, by form: what
 *  a save has to write, and nothing where nothing moved. */
export function changedForms(
  fields: readonly MessageField[],
  drafts: Readonly<Record<string, string>>,
): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const { form, text } of fields) {
    const draft = drafts[form];
    if (draft !== undefined && draft !== text) changed[form] = draft;
  }
  return changed;
}
