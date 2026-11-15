import { groupMessages, type Message } from '@kromatv/i18n/model';
import { noteFor, readNotes } from './notes.ts';
import { type CatalogSet, merged, readFiles } from './set.ts';
import { inspectLocale, readSource } from './status.ts';

/** One message a translator has left to do. Each language is given as the
 *  text itself, or as its templates by key when the message has plural
 *  variants. */
export interface TodoEntry {
  readonly state: 'missing' | 'outdated';
  readonly source: string | Readonly<Record<string, string>>;
  /** The same message in the language the translator reads beside the source. */
  readonly reference?: string | Readonly<Record<string, string>>;
  /** What the locale says today, for an outdated message. */
  readonly current?: string | Readonly<Record<string, string>>;
  /** What the project tells a translator about this message. */
  readonly note?: string;
}

export interface TodoOptions {
  /** A second language to show beside the source, where it has the message. */
  readonly reference?: string;
  /** Only the keys that start with one of these. */
  readonly prefixes?: readonly string[];
}

function shown(message: Message): string | Readonly<Record<string, string>> {
  const forms = Object.keys(message.forms);
  return forms.length === 1 ? (message.forms[message.key] ?? message.forms) : message.forms;
}

/**
 * What `locale` has left to translate in `set`, outdated messages first: the
 * hand-off to a translator, who answers with a flat `{ "key": "text" }` file
 * that `fill` writes back.
 */
export function todo(
  set: CatalogSet,
  locale: string,
  { reference, prefixes = [] }: TodoOptions = {},
): Record<string, TodoEntry> {
  const source = readSource(set);
  const status = inspectLocale(set, source, locale);
  const beside =
    reference === undefined || reference === source.locale || reference === locale
      ? new Map<string, Message>()
      : groupMessages(merged(readFiles(set, reference)), source.bases).messages;
  const wanted = (key: string) =>
    prefixes.length === 0 || prefixes.some((prefix) => key.startsWith(prefix));
  const notes = readNotes(set);
  const entries: Record<string, TodoEntry> = {};
  const add = (key: string, state: TodoEntry['state']) => {
    const original = source.messages.get(key);
    if (!original || !wanted(key)) {
      return;
    }
    const second = beside.get(key);
    const current = state === 'outdated' ? status.messages.get(key) : undefined;
    entries[key] = {
      state,
      source: shown(original),
      ...(second?.forms[key] === undefined ? {} : { reference: shown(second) }),
      ...(current ? { current: shown(current) } : {}),
      ...(noteFor(notes, key) === undefined ? {} : { note: noteFor(notes, key) }),
    };
  };
  for (const key of status.outdated) {
    add(key, 'outdated');
  }
  for (const key of status.missing) {
    add(key, 'missing');
  }
  return entries;
}
