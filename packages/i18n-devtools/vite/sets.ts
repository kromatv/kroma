import type { Message } from '@kromatv/i18n/model';
import { type CatalogSet, localesOf, readSource, type Source } from '@kromatv/i18n-tools';
import { z } from 'zod';

/** Every body of messages the server may write to, read when asked. */
export type Sets = () => readonly CatalogSet[];

const MAX_PAYLOAD_CHARS = 48_000;

/** The longest key a request may name, a plural variant included. */
export const MAX_KEY_CHARS = 256;

export const Locale = z.string().nonempty().max(35);

/** One message of one locale, as the page names it: no scope is the app's own
 *  catalogs, and a scope is the set of that name. */
export const Target = z.object({
  scope: z.string().nonempty().max(128).nullable(),
  locale: Locale,
  key: z.string().nonempty().max(MAX_KEY_CHARS),
});

export type Target = z.infer<typeof Target>;

/** A message found on disk: its set, that set's source language, and the
 *  message as the source language writes it. */
export interface Located {
  readonly set: CatalogSet;
  readonly source: Source;
  readonly message: Message;
}

/** What the page sent, as `schema` reads it, or why it is refused. The size is
 *  bounded before the schema reads any of it. */
export function parsed<T>(schema: z.ZodType<T>, payload: unknown): T | string {
  if (JSON.stringify(payload ?? null).length > MAX_PAYLOAD_CHARS) {
    return 'the request is too large';
  }
  const result = schema.safeParse(payload);
  if (result.success) {
    return result.data;
  }
  const said = result.error.issues.map(({ path, message }) =>
    `${path.join('.')} ${message}`.trim(),
  );
  return `the request is malformed: ${said.join(', ')}`;
}

/** The message `target` names, or why there is none: a scope no set answers
 *  to, a locale the set keeps no catalog for, a key that is no message of its
 *  source language. */
export function locate(sets: Sets, { scope, locale, key }: Target): Located | string {
  const set = scope === null ? sets()[0] : sets().find(({ name }) => name === scope);
  if (!set) {
    return `no catalogs are known for ${scope ?? 'the app'}`;
  }
  if (!localesOf(set).includes(locale)) {
    return `${set.name} has no catalog for ${locale}`;
  }
  const source = readSource(set);
  const message = source.messages.get(key);
  if (!message) {
    return `${key} is not a message of ${set.name}`;
  }
  return { set, source, message };
}

export function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
