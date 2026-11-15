import type { TVars } from './types';

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

/**
 * The variables argument of a translation call, as a rest tuple.
 *
 * A key written out, `t('cart.items', { count })`, is checked against what its
 * message takes: every `{token}` is required, a plural selector is a number,
 * and a message with no variables takes none. A key that is only known to be
 * one of several, a variable or a template like `` `status.${state}` ``,
 * accepts any variables, since which message it names is decided at runtime.
 * So does every key of a map that names none, `Record<string, ...>`, which is
 * the registry before a project augments it.
 */
export type VarsOf<M, K extends keyof M> = string extends keyof M
  ? [vars?: TVars]
  : IsUnion<K> extends true
    ? [vars?: TVars]
    : M[K] extends string
      ? [vars?: TVars]
      : keyof M[K] extends never
        ? [vars?: Record<string, never>]
        : [vars: M[K]];

/**
 * A key built from a template, `` `status.${state}` ``, as an argument type:
 * accepted when at least one of `Keys` fits it, so a typo in the part written
 * out fails to compile, and `never` otherwise. A key written out whole, or a
 * union of them, is `never` here too: those are checked one by one elsewhere.
 * So is a bare `string`, which says nothing about what it names.
 */
export type Templated<Keys extends string, S extends string> = string extends S
  ? never
  : Record<never, never> extends Record<S, unknown>
    ? [Extract<Keys, S>] extends [never]
      ? never
      : S
    : never;
