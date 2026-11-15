import { type Message, tokensIn, variablesOf, variantOf } from '@kromatv/i18n/model';
import { fill, syncSet } from '@kromatv/i18n-tools';
import { z } from 'zod';
import { quoteRefusal } from './quotes.ts';
import {
  type Located,
  locate,
  MAX_KEY_CHARS,
  parsed,
  reasonOf,
  type Sets,
  Target,
} from './sets.ts';

const MAX_TEXT_CHARS = 2000;
const MAX_FORMS = 16;

const Edit = Target.extend({
  forms: z
    .record(z.string().nonempty().max(MAX_KEY_CHARS), z.string().max(MAX_TEXT_CHARS))
    .refine((forms) => Object.keys(forms).length > 0, 'no form to write')
    .refine((forms) => Object.keys(forms).length <= MAX_FORMS, 'too many forms'),
});

interface EditAnswer {
  readonly written: readonly string[];
  readonly refused: string | null;
}

function strangerForm({ source, message }: Located, forms: readonly string[]): string | undefined {
  return forms.find(
    (form) => form !== message.key && variantOf(form, source.bases)?.base !== message.key,
  );
}

function strangerVariables(message: Message, texts: readonly string[]): string[] {
  const known = variablesOf(message);
  return [...new Set(texts.flatMap((text) => tokensIn(text)))].filter((name) => !known.has(name));
}

function refusal(at: Located, locale: string, forms: Readonly<Record<string, string>>) {
  const stranger = strangerForm(at, Object.keys(forms));
  if (stranger !== undefined) {
    return `${stranger} is not a form of ${at.message.key}`;
  }
  const texts = Object.values(forms);
  const unknown = strangerVariables(at.message, texts);
  if (unknown.length > 0) {
    const named = unknown.map((name) => `{${name}}`).join(' ');
    return `${at.message.key} is never given ${named}`;
  }
  if (locale === at.source.locale && texts.some((text) => text.trim() === '')) {
    return `${locale} is the source language: a message cannot lose its text there`;
  }
  for (const [form, text] of Object.entries(forms)) {
    const quote = quoteRefusal(at, form, text);
    if (quote !== null) {
      return quote;
    }
  }
  return null;
}

/**
 * Write the texts `payload` carries into the catalog of its locale, then bring
 * the locks in line. Refused, with nothing written, unless every key is a form
 * of a message the set's source language has, the locale is one the set keeps
 * a catalog for, every `{placeholder}` is one the source message names, and
 * every `$t(key)` quotes a message kept in the same catalog file. An empty
 * text removes that form, which the source language is refused.
 */
export function editMessage(sets: Sets, payload: unknown): EditAnswer {
  const edit = parsed(Edit, payload);
  if (typeof edit === 'string') {
    return { written: [], refused: edit };
  }
  try {
    const at = locate(sets, edit);
    if (typeof at === 'string') {
      return { written: [], refused: at };
    }
    const refused = refusal(at, edit.locale, edit.forms);
    if (refused !== null) {
      return { written: [], refused };
    }
    const { written } = fill(at.set, edit.locale, edit.forms);
    syncSet(at.set);
    return { written, refused: null };
  } catch (error) {
    return { written: [], refused: reasonOf(error) };
  }
}
