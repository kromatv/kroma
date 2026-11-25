// One resolved declaration to its atomic classes and the rules behind them, by
// the same compiler react-native-web runs in the browser. Same identifiers,
// same declarations: a class the build emitted and one the runtime would have
// minted for the same value are the same class.

import { createRequire } from 'node:module';

type OrderedRules = readonly (readonly [rules: readonly string[], group: number])[];

interface Compiler {
  atomic: (style: Record<string, unknown>) => [Record<string, unknown>, OrderedRules];
  stringifyValueWithProperty: (value: unknown, property: string) => string;
}

interface Preprocessor {
  preprocess: (
    style: Record<string, unknown>,
    options: Record<string, boolean>,
  ) => Record<string, unknown>;
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

/** The declarations a longhand's classes carry, without their selectors, one
 *  class per line: a logical side compiles to a class per writing direction. */
export interface Carrier {
  readonly body: string;
}

/** The rules longhands the engine already resolved need in the sheet. */
export function rulesOf(longhands: Record<string, unknown>): CompiledRule[] {
  const [, ordered] = atomic(preprocess(longhands, SHADOWS));
  return ordered.flatMap(([css, group]) => css.map((rule) => ({ group, css: rule })));
}

function bodyOf(cls: unknown, rules: readonly string[] | undefined): string | null {
  const css = rules?.length === 1 ? rules[0] : undefined;
  const head = `.${String(cls)}{`;
  if (typeof cls !== 'string' || css === undefined || !css.startsWith(head) || !css.endsWith('}')) {
    return null;
  }
  return css.slice(head.length, -1);
}

/**
 * What a single longhand compiles to, when each of its classes carries one rule
 * of its own. Null for a property the compiler does not write that way: a
 * shadow the preprocessor folds into another property, a value it writes as
 * several rules.
 */
export function carrierOf(property: string, value: unknown): Carrier | null {
  const [style, ordered] = atomic(preprocess({ [property]: value }, SHADOWS));
  const classes = Object.entries(style)
    .filter(([key]) => !key.startsWith('$$'))
    .flatMap(([, cls]) => (Array.isArray(cls) ? cls : [cls]));
  if (classes.length === 0 || classes.length !== ordered.length) {
    return null;
  }
  const bodies = classes.map((cls, at) => bodyOf(cls, ordered[at]?.[0]));
  return bodies.every((body) => body !== null) ? { body: bodies.join('\n') } : null;
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
