// One resolved declaration to its atomic classes and the rules behind them, by
// the same compiler react-native-web runs in the browser. Same identifiers,
// same declarations: a class the build emitted and one the runtime would have
// minted for the same value are the same class.

import { createRequire } from 'node:module';

type OrderedRules = readonly (readonly [rules: readonly string[], group: number])[];

interface Compiler {
  atomic(style: Record<string, unknown>): [Record<string, unknown>, OrderedRules];
  stringifyValueWithProperty(value: unknown, property: string): string;
}

interface Preprocessor {
  preprocess(
    style: Record<string, unknown>,
    options: Record<string, boolean>,
  ): Record<string, unknown>;
}

const require = createRequire(import.meta.url);

const { atomic, stringifyValueWithProperty } =
  require('react-native-web/dist/cjs/exports/StyleSheet/compiler') as Compiler;

const { preprocess } =
  require('react-native-web/dist/cjs/exports/StyleSheet/preprocess') as Preprocessor;

const hash = require('react-native-web/dist/cjs/exports/StyleSheet/compiler/hash') as (
  text: string,
) => string;

const SHADOWS = { shadow: true, textShadow: true };

/** A rule and the group that orders it in the sheet; react-native-web's own
 *  groups, so a longhand's class always outranks a shorthand's. */
export interface CompiledRule {
  readonly group: number;
  readonly css: string;
}

/** One longhand's class and the declarations behind it, without the selector. */
export interface Carrier {
  readonly cls: string;
  readonly body: string;
}

/** The rules longhands the engine already resolved need in the sheet. */
export function rulesOf(longhands: Record<string, unknown>): CompiledRule[] {
  const [, ordered] = atomic(preprocess(longhands, SHADOWS));
  return ordered.flatMap(([css, group]) => css.map((rule) => ({ group, css: rule })));
}

/**
 * The one rule a single longhand compiles to, and the class that carries it.
 * Null for a property the compiler does not write as one rule of its own: a
 * shadow the preprocessor folds into another property, a value it splits in
 * two.
 */
export function carrierOf(property: string, value: unknown): Carrier | null {
  const [style, ordered] = atomic(preprocess({ [property]: value }, SHADOWS));
  const cls = style[property];
  const group = ordered[0];
  if (typeof cls !== 'string' || ordered.length !== 1 || group === undefined) return null;
  const [rules] = group;
  const css = rules.length === 1 ? (rules[0] as string) : '';
  const head = `.${cls}{`;
  if (!css.startsWith(head) || !css.endsWith('}')) return null;
  return { cls, body: css.slice(head.length, -1) };
}

/** A value as the renderer writes it into a declaration: `12` is `12px` on a
 *  length, `'accent'` is already the custom property the theme resolved it to. */
export function cssValue(property: string, value: unknown): string {
  return stringifyValueWithProperty(value, property);
}

/** react-native-web's own hash: six characters, the first a letter. */
export function hashOf(text: string): string {
  return hash(text);
}
