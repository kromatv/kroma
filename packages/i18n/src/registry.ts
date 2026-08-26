import type { TVars } from './types';

/**
 * The seam that makes this package typed without a generic at every call site.
 *
 * A project augments it once, next to where it builds its instance, and from
 * then on {@link Locale}, {@link MessageKey} and {@link Translate} are its own
 * locales and its own keys everywhere they are imported:
 *
 * ```ts
 * export const i18n = createI18n({ catalogs: { fr, en }, defaultLocale: 'fr' });
 *
 * declare module '@kroma/i18n' {
 *   interface Register extends InferRegister<typeof i18n> {}
 * }
 * ```
 *
 * Left alone it stays empty and the three types widen to `string`, so the
 * package is usable before it is configured and a consumer that never augments
 * it still compiles.
 */
// biome-ignore lint/suspicious/noEmptyInterface: the augmentation target; a type alias cannot be reopened.
export interface Register {}

/** The locales the project registered, or `string` before it registers any. */
export type Locale = Register extends { locale: infer L extends string } ? L : string;

/** The message map the project registered, keyed by message key. */
export type Messages = Register extends { messages: infer M extends Record<string, string> }
  ? M
  : Record<string, string>;

/** Every key the default catalog declares, which is the catalog that has to be
 *  complete because it is the one every other locale falls back to. */
export type MessageKey = keyof Messages & string;

/** A translation function bound to one locale. */
export type Translate = (key: MessageKey, vars?: TVars) => string;
