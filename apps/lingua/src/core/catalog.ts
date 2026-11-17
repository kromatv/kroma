import { z } from 'zod';

/** One catalog file's messages, in the order the file lists them. */
export type Messages = Record<string, string>;

/** A catalog file as read: its messages, and the `$schema` pointer an editor follows, which is no message. */
export interface CatalogText {
  messages: Messages;
  pointer: string | undefined;
}

const Flat = z.record(z.string(), z.string());

const SCHEMA = '$schema';

/** A flat `{ "key": "message" }` file, or null when the text is anything else. */
export function parseCatalog(text: string): CatalogText | null {
  try {
    const result = Flat.safeParse(JSON.parse(text));
    if (!result.success) {
      return null;
    }
    const { [SCHEMA]: pointer, ...messages } = result.data;
    return { messages, pointer };
  } catch {
    return null;
  }
}

/** The messages of a catalog file, or null when the text is not one. */
export function parseMessages(text: string): Messages | null {
  return parseCatalog(text)?.messages ?? null;
}

/** The file text for `messages`, as i18n-tools writes it: two-space JSON, the pointer first, a trailing newline. */
export function renderCatalog(messages: Readonly<Messages>, pointer?: string): string {
  const content = pointer === undefined ? messages : { [SCHEMA]: pointer, ...messages };
  return `${JSON.stringify(content, null, 2)}\n`;
}
