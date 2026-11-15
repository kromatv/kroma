import { tokensIn, variablesOf } from '@kromatv/i18n/model';
import { baseOf, fill, markMachine, syncSet } from './edit.ts';
import type { CatalogSet } from './set.ts';
import { readSource, type Source } from './status.ts';
import { type TodoEntry, todo } from './todo.ts';

/** One batch handed to whatever translates: the messages, and what the
 *  translator has to know about the two languages. */
export interface TranslationRequest {
  readonly locale: string;
  readonly sourceLocale: string;
  readonly referenceLocale?: string;
  /** The CLDR plural categories of `locale`, `other` among them. */
  readonly categories: readonly string[];
  readonly messages: Readonly<Record<string, TodoEntry>>;
}

/** Translates one batch, answering key to text. A plural message is answered
 *  with one entry per variant key. */
export type Translator = (request: TranslationRequest) => Promise<Record<string, string>>;

export interface TranslateOptions {
  readonly reference?: string;
  readonly prefixes?: readonly string[];
  /** How many messages one request carries. */
  readonly batch?: number;
  /** Stop after this many messages. */
  readonly limit?: number;
  /** Told after each batch how many messages are done, of how many. */
  readonly onBatch?: (written: number, total: number) => void;
}

export interface Translated {
  readonly written: string[];
  /** What the translator answered that could not be kept, and why. */
  readonly refused: { key: string; why: string }[];
  /** How many messages were asked for. */
  readonly asked: number;
}

const BATCH = 40;

function categoriesOf(locale: string): string[] {
  try {
    return new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  } catch {
    return ['one', 'other'];
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

function refusal(
  key: string,
  text: string,
  asked: Readonly<Record<string, TodoEntry>>,
  source: Source,
): string | null {
  const message = baseOf(key, source);
  const original = message === null ? undefined : source.messages.get(message);
  if (message === null || !original || asked[message] === undefined) return 'was not asked for';
  if (text.trim() === '') return 'is empty';
  const known = variablesOf(original);
  const unknown = tokensIn(text).filter((name) => !known.has(name));
  return unknown.length > 0 ? `names {${unknown.join('}, {')}}` : null;
}

// The answers worth keeping. What is not is added to `refused`, with why.
function checked(
  answers: Readonly<Record<string, string>>,
  asked: Readonly<Record<string, TodoEntry>>,
  source: Source,
  refused: Translated['refused'],
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, text] of Object.entries(answers)) {
    const why = refusal(key, text, asked, source);
    if (why === null) kept[key] = text;
    else refused.push({ key, why });
  }
  return kept;
}

/**
 * Fill what `locale` lacks in `set` through `translator`, a batch at a time.
 * Every answer is checked before it is written: it has to be a key that was
 * asked for, it cannot be empty, and it cannot name a placeholder the source
 * does not pass. What is written is marked as a machine's, so the report keeps
 * it apart until someone has read it.
 */
export async function translate(
  set: CatalogSet,
  locale: string,
  translator: Translator,
  { reference, prefixes, batch = BATCH, limit, onBatch }: TranslateOptions = {},
): Promise<Translated> {
  const source = readSource(set);
  const work = Object.entries(todo(set, locale, { reference, prefixes })).slice(0, limit);
  const written: string[] = [];
  const refused: Translated['refused'] = [];
  const answered = new Set<string>();
  for (const group of chunks(work, batch)) {
    const messages = Object.fromEntries(group);
    const answers = await translator({
      locale,
      sourceLocale: source.locale,
      referenceLocale: reference,
      categories: categoriesOf(locale),
      messages,
    });
    const kept = checked(answers, messages, source, refused);
    written.push(...fill(set, locale, kept).written);
    syncSet(set);
    markMachine(set, locale, Object.keys(kept));
    for (const key of Object.keys(kept)) answered.add(baseOf(key, source) ?? key);
    onBatch?.(answered.size, work.length);
  }
  return { written, refused, asked: work.length };
}
