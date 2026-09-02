import type { TVars } from './types';

/**
 * The seam that makes this package typed without a generic at every call site.
 *
 * The `@kroma/i18n/vite` plugin augments it from the catalog folder, with the
 * locales it found and every namespace's messages folded into one map:
 *
 * ```ts
 * declare module '@kroma/i18n' {
 *   interface Register {
 *     locale: 'en' | 'fr';
 *     messages: typeof navMessages & typeof playerMessages;
 *   }
 * }
 * ```
 *
 * From then on {@link Locale}, {@link MessageKey} and {@link Translate} are the
 * app's own everywhere they are imported. Left alone it stays empty and the
 * types widen to `string`, so the package is usable before it is configured
 * and a consumer that never augments it still compiles.
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
