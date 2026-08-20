import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { type AnySv, normalize, type StyleDecl, type SvStateName, stabilise } from '#ui/core';
import { splitBoxLayers } from '#ui/lib/box-layers';
import { ARROW, COLOUR_MOTION, HAND } from '#ui/lib/cursor';
import { WEB } from '#ui/lib/platform';
import type { Resolve } from './focusable-types';

function coat(decl: StyleDecl | undefined): ViewStyle | undefined {
  return decl ? (stabilise(normalize(decl as Record<string, unknown>)) as ViewStyle) : undefined;
}

const NO_SLOTS = Object.freeze({ root: undefined }) as unknown as ReturnType<AnySv>;

/** What `next` changes about `base`, so a state coat can be layered over a
 *  caller's own style without reasserting everything underneath it. */
function deltaOf(base: object | undefined, next: object | undefined): ViewStyle | null {
  if (!base || !next || base === next) return null;
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [key, value] of Object.entries(next)) {
    if ((base as Record<string, unknown>)[key] === value) continue;
    out[key] = value;
    any = true;
  }
  return any ? (Object.freeze(out) as ViewStyle) : null;
}

// `[a, b]` that keeps its identity while `a` and `b` keep theirs, so the
// native `splitBoxLayers` memo below is not re-run on every render.
function usePair(a: StyleProp<ViewStyle>, b: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  return useMemo(() => {
    if (a == null) return b;
    return b == null ? a : [a, b];
  }, [a, b]);
}

function pointerCursor(disabled: boolean, onPress: unknown): ViewStyle | null {
  if (!WEB) return null;
  if (disabled) return ARROW;
  return onPress ? HAND : null;
}

interface PaintInput {
  recipe: AnySv | undefined;
  vars: unknown;
  states: Partial<Record<SvStateName, StyleDecl>> | undefined;
  style: StyleProp<ViewStyle>;
  hovered: boolean;
  focusVisible: boolean;
  disabled: boolean;
  inert: boolean;
  canPress: boolean;
  onPress: (() => void) | undefined;
}

/** Resolves the recipe and the one-off state coats into the styles a form
 *  paints with: `dressed` for the rest state, the rest per interaction. */
function useFocusablePaint({
  recipe,
  vars,
  states,
  style,
  hovered,
  focusVisible,
  disabled,
  inert,
  canPress,
  onPress,
}: PaintInput) {
  const coats = useMemo(
    () => ({ focus: coat(states?.focus), hover: coat(states?.hover), press: coat(states?.press) }),
    [states],
  );
  const focusedStyle = coats.focus;
  const hoveredStyle = coats.hover;
  const pressedStyle = coats.press;

  const lit = !inert;
  const rest: ReturnType<AnySv> = recipe
    ? recipe(vars as never, { hover: lit && hovered, focus: focusVisible, press: false, disabled })
    : NO_SLOTS;
  const resolve: Resolve = (pressed: boolean) =>
    pressed && lit && recipe
      ? recipe(vars as never, { hover: hovered, focus: focusVisible, press: true, disabled })
      : rest;

  // The recipe paints the control through its `root` slot, under the caller's
  // own `style` so a one-off override still wins.
  const root = recipe ? (rest.root as StyleProp<ViewStyle>) : undefined;
  const painted = usePair(root, style);
  // Only what the press ADDS, not the whole root: the press coat lands after the
  // caller's `style`, so re-applying the resolved root there would revert a
  // one-off override for as long as the finger is down.
  const pressDelta = recipe && canPress ? deltaOf(rest.root, resolve(true).root) : null;
  const paintedPressed = pressDelta ?? pressedStyle;

  // Native renders the control as two views, so the half of the style that says
  // how the parent places this control has to ride on the outer one; the web
  // targets have a single view and keep the style whole.
  const layers = useMemo(() => (WEB ? null : splitBoxLayers(painted)), [painted]);

  // Under `painted`, never over it: a control that states its own cursor - a
  // resize seam asking for `col-resize` - has to keep it.
  const cursor = pointerCursor(disabled, onPress);
  // Under `painted` as well: a control that states its own transition keeps it.
  const dressed = useMemo(
    () => (WEB ? [COLOUR_MOTION, cursor, painted] : painted),
    [cursor, painted],
  );

  return { dressed, focusedStyle, hoveredStyle, layers, paintedPressed, resolve, rest };
}

export { useFocusablePaint };
