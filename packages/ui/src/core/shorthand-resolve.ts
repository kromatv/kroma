// Resolving a shorthand bag into React Native longhands: which keys of a prop
// bag are shorthands at all, and what one declaration becomes at a breakpoint.
// The vocabulary those rules are written in is `shorthands.ts`.

import type { ViewStyle } from 'react-native';
import { breakpointBits, breakpointIndex, valueAt } from '#ui/core/breakpoint';
import {
  BOX_STYLE_PROPS,
  type BoxStyleProps,
  RULE_KEYS,
  RULES,
  type Rule,
} from '#ui/core/shorthands';
import { activeTheme, radiusValue } from '#ui/core/theme';
import type { FontToken, TypeRole } from '#ui/core/tokens';

/**
 * Split a prop bag into the shorthands and everything else.
 *
 * Every consumer needs exactly this partition - <Box> and <Text> to tell a style
 * prop from a real host prop, a recipe to tell what needs resolving from what
 * passes through - so the rule for recognising a shorthand lives in one place.
 *
 * `key` canonicalises the caller's prop order, so `row gap={4}` and `gap={4} row`
 * are one entry in whatever cache the caller keys on it; it is empty when nothing
 * needs resolving.
 */
export function splitShorthand(
  props: Readonly<Record<string, unknown>>,
  names: ReadonlySet<string> = BOX_STYLE_PROPS,
): {
  shorthand: Record<string, unknown>;
  rest: Record<string, unknown>;
  /** Whether any shorthand was found, so a caller can skip the resolver. */
  any: boolean;
  key: string;
  /** The breakpoints the bag names, 0 when it names none; see
   *  {@link breakpointBits}. */
  breakpoints: number;
} {
  const shorthand: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  const parts: string[] = [];
  let any = false;
  let breakpoints = 0;
  for (const name of Object.keys(props)) {
    const value = props[name];
    if (!names.has(name)) {
      rest[name] = value;
      continue;
    }
    shorthand[name] = value;
    any = true;
    if (value === undefined) continue;
    // A breakpoint object and a transform are objects; everything else is a
    // primitive. The primitive side is named explicitly so String() never meets
    // an object.
    const primitive =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    if (!primitive) breakpoints |= breakpointBits(value);
    parts.push(`${name}:${primitive ? String(value) : JSON.stringify(value)}`);
  }
  parts.sort((a, b) => (a < b ? -1 : 1));
  return { shorthand, rest, any, key: parts.join(';'), breakpoints };
}

/**
 * Which breakpoints a whole declaration names, for a consumer that compiles one
 * ahead of time (a recipe layer, a `styles()` value) and has to know whether it
 * belongs on the breakpoint axis at all.
 */
export function declaredBreakpoints(
  decl: Readonly<Record<string, unknown>>,
  names: ReadonlySet<string> = BOX_STYLE_PROPS,
): number {
  let breakpoints = 0;
  for (const name of Object.keys(decl)) {
    if (names.has(name)) breakpoints |= breakpointBits(decl[name]);
  }
  return breakpoints;
}

function applyRule(out: Record<string, unknown>, rule: Rule, value: unknown): void {
  if (typeof rule === 'string') {
    out[rule] = value;
  } else if (typeof rule === 'function') {
    Object.assign(out, rule(value));
  } else if (Array.isArray(rule)) {
    for (const longhand of rule) out[longhand] = value;
  } else if (value) {
    Object.assign(out, rule);
  }
}

function isPerBreakpoint(raw: unknown): raw is object {
  return typeof raw === 'object' && raw !== null;
}

function flatAt(raw: unknown, index: number): unknown {
  return isPerBreakpoint(raw) ? valueAt(raw, index) : raw;
}

function applyShorthands(
  out: Record<string, unknown>,
  p: Readonly<BoxStyleProps>,
  index: number,
): number {
  let at = index;
  for (const key of RULE_KEYS) {
    const raw = (p as Record<string, unknown>)[key];
    if (raw === undefined) continue;
    if (!isPerBreakpoint(raw)) {
      applyRule(out, RULES[key], raw);
      continue;
    }
    if (at < 0) at = breakpointIndex();
    const value = valueAt(raw, at);
    if (value !== undefined) applyRule(out, RULES[key], value);
  }
  return at;
}

function applyCircleRadius(
  out: Record<string, unknown>,
  p: Readonly<BoxStyleProps>,
  at: number,
): void {
  if (flatAt(p.radius, at) !== 'circle') return;
  // A disc is half of ITSELF, so a stated side beats the clamped fallback.
  const height = flatAt(p.h, at);
  const stated = typeof height === 'number' ? height : flatAt(p.w, at);
  out.borderRadius = radiusValue('circle', typeof stated === 'number' ? stated : undefined);
}

/**
 * Resolves a prop bag into React Native longhands at a breakpoint, defaulting to
 * the active one. A bag stating nothing per breakpoint never walks a cascade and
 * resolves exactly as it did before there was an axis at all.
 */
export function boxStyle(p: Readonly<BoxStyleProps>, index?: number): ViewStyle {
  const out: Record<string, unknown> = {};
  const at = applyShorthands(out, p, index ?? -1);
  if (p.radius !== undefined) applyCircleRadius(out, p, at < 0 ? breakpointIndex() : at);
  return out as ViewStyle;
}

/**
 * The text half of the vocabulary. Only a style DECLARATION speaks it (a recipe
 * layer, a `styles()` value); it is deliberately not part of `BoxStyleProps`,
 * because a <Box> is a View and a View cannot paint type.
 */
export interface TextStyleProps {
  /** A whole type role, spread under the rest of the layer, so
   *  `{ text: 'label', fontSize: 13 }` is the label role at 13px. */
  text?: TypeRole;
  /** Font family by token name; wins over the family `text` brought in. */
  font?: FontToken;
}

/**
 * Resolves the text shorthands of one layer, consuming their keys, or nothing
 * if it has none. Membership-checked against the theme, not just typeof: a slot
 * that feeds a component's PROPS may carry a `text` of its own, and that one
 * must pass through untouched.
 */
export function textStyle(decl: Record<string, unknown>): Record<string, unknown> | undefined {
  const theme = activeTheme();
  const role = decl.text;
  const family = decl.font;
  const hasRole = typeof role === 'string' && role in theme.type;
  const hasFamily = typeof family === 'string' && family in theme.fonts;
  if (!hasRole && !hasFamily) return undefined;
  const out: Record<string, unknown> = {};
  if (hasRole) {
    Object.assign(out, theme.type[role as TypeRole]);
    delete decl.text;
  }
  if (hasFamily) {
    out.fontFamily = theme.fonts[family as FontToken];
    delete decl.font;
  }
  return out;
}
