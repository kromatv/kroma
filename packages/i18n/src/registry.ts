import type { TVars } from './types';
import type { Templated, VarsOf } from './vars';

/**
 * The seam that makes this package typed without a generic at every call site.
 *
 * The `@kromatv/i18n/vite` plugin augments it from the catalog folder, with the
 * locales it found and what every message of the source language takes:
 *
 * ```ts
 * declare module '@kromatv/i18n' {
 *   interface Register {
 *     locale: 'en' | 'fr';
 *     messages: {
 *       'nav.home': {};
 *       'cart.items': { count: number };
 *     };
 *   }
 * }
 * ```
 *
 * From then on {@link Locale}, {@link MessageKey} and {@link Translate} are the
 * app's own everywhere they are imported. Left alone it stays empty and the
 * types widen to `string`, so the package is usable before it is configured
 * and a consumer that never augments it still compiles.
 */
// oxlint-disable-next-line typescript/no-empty-interface -- the augmentation target; a type alias cannot be reopened.
export interface Register {}

/** The locales the project registered, or `string` before it registers any. */
export type Locale = Register extends { locale: infer L extends string } ? L : string;

/** What each message takes, keyed by message key: the variables its templates
 *  name. A plural variant is not a key of its own; its base is. */
export type Messages = Register extends { messages: infer M extends Record<string, object> }
  ? M
  : Record<string, TVars>;

/** Every message the source language declares, which is the language that has
 *  to be complete because it is the one every other locale falls back to. */
export type MessageKey = keyof Messages & string;

/** The variables `K` takes, as an object type. */
export type MessageVars<K extends MessageKey> = Messages[K];

/**
 * A translation function bound to one locale. A key written out is checked
 * against the variables its message takes, and a key built from a template
 * against the messages it could name: `` t(`genre.${slug}`) `` compiles while
 * a message starts with `genre.`, and stops compiling when none does.
 */
export interface Translate {
  <S extends string>(key: Templated<MessageKey, S>, vars?: TVars): string;
  <K extends MessageKey>(key: K, ...vars: VarsOf<Messages, K>): string;
}
