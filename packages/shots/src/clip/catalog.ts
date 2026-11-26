import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** Says which catalog key a text on screen reads, or null for a text no
 *  catalog holds (a title, a name, a message the server sent). */
export type KeyOf = (text: string) => string | null;

const CORE_DIR = 'packages/core/src/locales';
const MODULES_DIR = 'modules';
const Messages = z.record(z.string(), z.unknown());
const SLOT = /\{[^{}]*\}|\$t\([^()]*\)/;
const REF = /\$t\(([^(),]+)(?:,[^()]*)?\)/g;
const NOT_A_LETTER = /\P{L}/gu;
const LEAST_LETTERS = 2;
const LETTER_SHARE = 3;

type Template = Readonly<{ parts: readonly string[]; letters: number; key: string }>;

function stringsOf(file: string): [string, string][] {
  const entries = Object.entries(Messages.parse(JSON.parse(readFileSync(file, 'utf8'))));
  return entries.flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : []));
}

function coreFiles(repoDir: string, language: string): string[] {
  const dir = join(repoDir, CORE_DIR, language);
  if (!existsSync(dir)) {
    return [];
  }
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' });
  return files.filter((file) => file.endsWith('.json')).map((file) => join(dir, file));
}

function moduleFiles(repoDir: string, language: string): string[] {
  const dir = join(repoDir, MODULES_DIR);
  const files = readdirSync(dir).map((id) => join(dir, id, 'locales', `${language}.json`));
  return files.filter((file) => existsSync(file));
}

/** Every message a screen in `language` may show, by key: the core catalogs
 *  and every module's, in `language` and then in each of `fallbacks`. */
export function catalogMessages(
  repoDir: string,
  languages: readonly string[],
): Map<string, string> {
  const messages = new Map<string, string>();
  for (const language of languages) {
    const files = [...coreFiles(repoDir, language), ...moduleFiles(repoDir, language)];
    for (const [key, value] of files.flatMap(stringsOf)) {
      messages.set(`${language}:${key}`, value);
    }
  }
  return messages;
}

function lettersOf(text: string): number {
  return text.replaceAll(NOT_A_LETTER, '').length;
}

function withRefs(messages: ReadonlyMap<string, string>, key: string, message: string): string {
  const language = key.slice(0, key.indexOf(':'));
  return message.replaceAll(
    REF,
    (ref: string, name: string) => messages.get(`${language}:${name.trim()}`) ?? ref,
  );
}

function fits(parts: readonly string[], text: string): boolean {
  const first = parts[0] ?? '';
  const last = parts.at(-1) ?? '';
  if (!text.startsWith(first) || !text.endsWith(last)) {
    return false;
  }
  let at = first.length;
  for (const part of parts.slice(1, -1)) {
    const found = text.indexOf(part, at + 1);
    if (found === -1) {
      return false;
    }
    at = found + part.length;
  }
  return text.length - last.length > at;
}

function templateKey(templates: readonly Template[], text: string): string | null {
  const letters = lettersOf(text);
  const found = templates.find(
    (template) => template.letters * LETTER_SHARE >= letters && fits(template.parts, text),
  );
  return found?.key ?? null;
}

/** Finds the key of a text among `messages`: a message read as written, with
 *  each `$t(ref)` as the message it names, or one whose `{variables}` stand
 *  for anything, as long as what it writes itself holds two letters and a
 *  third of the text's (`{percent}%` holds none, `{head} and {last}` too few
 *  for a sentence). */
export function keyFinder(messages: ReadonlyMap<string, string>): KeyOf {
  const exact = new Map<string, string>();
  const templates: Template[] = [];
  for (const [key, message] of messages) {
    const written = withRefs(messages, key, message);
    const parts = written.split(SLOT);
    if (parts.length === 1) {
      exact.set(written, exact.get(written) ?? key);
    } else {
      templates.push({ parts, letters: lettersOf(parts.join('')), key });
    }
  }
  const telling = templates
    .filter(({ letters }) => letters >= LEAST_LETTERS)
    .sort((a, b) => b.letters - a.letters);
  return (text) => exact.get(text) ?? templateKey(telling, text);
}
