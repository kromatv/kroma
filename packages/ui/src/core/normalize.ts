// Authored declaration -> the canonical form the resolver merges. Runs once per
// declaration at module load, never per render, and once per build for the
// declarations the build compiles ahead of time: nothing here reads a store.

import { isStaticStyle, staticStates } from '#ui/core/atomic/static-style';
import { COLOR_KEYS, color } from '#ui/core/color';
import {
  boxStyle,
  declaredBreakpoints,
  splitShorthand,
  textStyle,
} from '#ui/core/shorthand-resolve';
import type { BoxStyleProps } from '#ui/core/shorthands';
import { STATE_KEYS, SV_STATES, type SvStateName } from '#ui/core/states';

export interface Split {
  rest: Record<string, unknown>;
  states: Partial<Record<SvStateName, Record<string, unknown>>>;
  declared: SvStateName[];
  breakpoints: number;
}

/**
 * Splits a declaration into its rest value and its per-state layers, normalising
 * each against the breakpoint at `index`. Throws on an unknown `_`-prefixed key:
 * TypeScript only guards those for an inline literal, and a layer built from a
 * variable would otherwise carry `_active` into the output as a style key React
 * Native silently ignores.
 *
 * A layer the build already compiled comes back as it is, its states read off
 * the compiled form.
 */
const CONDITION_KEYS: ReadonlySet<string> = new Set(['base', ...SV_STATES]);

// A value stated per interaction state, `base` for the rest: an object whose
// keys are all conditions and at least one of them a state, which is what
// tells it apart from a value stated per breakpoint.
function conditional(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  const stated =
    keys.length > 0 &&
    keys.every((key) => CONDITION_KEYS.has(key)) &&
    keys.some((key) => key !== 'base');
  return stated ? (value as Record<string, unknown>) : null;
}

type StateLayers = Partial<Record<SvStateName, Record<string, unknown>>>;

interface Sorted {
  authored: Record<string, unknown>;
  byState: StateLayers;
  explicit: StateLayers;
}

function stateOf(key: string): SvStateName {
  if (!STATE_KEYS.has(key)) {
    throw new Error(
      `sv: unknown state "${key}". States are ${[...STATE_KEYS].join(', ')}; anything else a component can be in is a variant.`,
    );
  }
  return key.slice(1) as SvStateName;
}

function sortValue(key: string, value: unknown, into: Sorted): void {
  const stated = conditional(value);
  if (!stated) {
    into.authored[key] = value;
    return;
  }
  if ('base' in stated) into.authored[key] = stated.base;
  for (const name of SV_STATES) {
    if (!(name in stated)) continue;
    const layer = into.byState[name] ?? {};
    layer[key] = stated[name];
    into.byState[name] = layer;
  }
}

function sortKeys(decl: Record<string, unknown>): Sorted {
  const sorted: Sorted = { authored: {}, byState: {}, explicit: {} };
  for (const key of Object.keys(decl)) {
    const value = decl[key];
    if (key.startsWith('_')) sorted.explicit[stateOf(key)] = value as Record<string, unknown>;
    else sortValue(key, value, sorted);
  }
  return sorted;
}

export function split(decl: Record<string, unknown> | undefined, index: number): Split | undefined {
  if (!decl) return undefined;
  if (isStaticStyle(decl)) {
    const states = staticStates(decl);
    return { rest: decl, states, declared: Object.keys(states) as SvStateName[], breakpoints: 0 };
  }
  const { authored, byState, explicit } = sortKeys(decl);
  const states: Split['states'] = {};
  const declared: SvStateName[] = [];
  let breakpoints = 0;
  for (const name of SV_STATES) {
    const stated = byState[name];
    const layer = explicit[name];
    if (!stated && !layer) continue;
    const merged = { ...stated, ...layer };
    breakpoints |= declaredBreakpoints(merged);
    states[name] = normalize(merged, index);
    declared.push(name);
  }
  return {
    rest: normalize(authored, index),
    states,
    declared,
    breakpoints: breakpoints | declaredBreakpoints(authored),
  };
}

/**
 * Rewrites one layer into React Native longhands, resolving shorthands, colours
 * and, against the breakpoint at `index`, any value stated per breakpoint.
 *
 * Per LAYER, which is what makes merging correct: merging authored keys would
 * leave `{ px: 18 }` and `{ p: 12 }` both alive, and the resolver would then
 * pick by specificity rather than by order, so an earlier base would beat a
 * later variant. Once every layer speaks longhand, `Object.assign` is the
 * conflict resolution - last write wins, per property, like CSS.
 *
 * A layer the build already compiled is its own canonical form.
 */
export function normalize(decl: Record<string, unknown>, index: number): Record<string, unknown> {
  if (isStaticStyle(decl)) return decl;
  const { shorthand, rest, any } = splitShorthand(decl);
  // Text before colour: `text` may bring keys the loop below never touches, and
  // consuming `text`/`font` first keeps them out of the colour pass entirely.
  const type = textStyle(rest);
  for (const key of Object.keys(rest)) {
    const value = rest[key];
    if (COLOR_KEYS.has(key) && typeof value === 'string') rest[key] = color(value);
  }
  if (!any && !type) return rest;
  // Shorthands first, the role's bundle under them, so a longhand in the same
  // layer wins over both.
  return { ...type, ...boxStyle(shorthand as BoxStyleProps, index), ...rest };
}
