import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  type AnySv,
  activeTheme,
  normalize,
  type StyleDecl,
  type SvStateName,
  sharedStyle,
  stabilise,
} from '#ui/core';
import { useSv } from '#ui/core/recipe';
import { useStyleScope } from '#ui/core/style-context';
import { DEFAULT_STYLE_SCOPE, type StyleScope } from '#ui/core/style-scope';
import type { RingToken, Theme } from '#ui/core/theme';
import { useBreakpointIndex } from '#ui/core/use-breakpoint';
import { useTheme } from '#ui/core/use-theme';
import { splitBoxLayers } from '#ui/lib/box-layers';
import { ARROW, COLOUR_MOTION, HAND } from '#ui/lib/cursor';
import { NO_OUTLINE } from '#ui/lib/field-shell';
import { GROUNDED, LIFTED } from '#ui/lib/focus-lift';
import { WEB } from '#ui/lib/platform';
import type { Resolve } from './focusable-types';

function coat(decl: StyleDecl | undefined, index: number, theme: Theme): ViewStyle | undefined {
  return decl ? (stabilise(normalize(decl, index, theme)) as ViewStyle) : undefined;
}

const NO_SLOTS = Object.freeze({ root: undefined }) as unknown as ReturnType<AnySv>;

/** What `next` changes about `base`, so a state coat can be layered over a
 *  caller's own style without reasserting everything underneath it. */
function deltaOf(base: object | undefined, next: object | undefined): ViewStyle | null {
  if (!base || !next || base === next) return null;
  const out: Record<string, unknown> = {};
  let any = false;
  for (const [key, value] of Object.entries(next)) {
    if (Reflect.get(base, key) === value) continue;
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

function pointerCursor(disabled: boolean, actionable: boolean): ViewStyle | null {
  if (!WEB) return null;
  if (disabled) return ARROW;
  return actionable ? HAND : null;
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
  actionable: boolean;
}

/** Resolves the recipe and the one-off state coats into the styles a form
 *  paints with: `dressed` for the rest state, the rest per interaction. */
function useFocusablePaint({
  recipe: definition,
  vars,
  states,
  style,
  hovered,
  focusVisible,
  disabled,
  inert,
  canPress,
  actionable,
}: PaintInput) {
  const scope = useStyleScope();

  const theme = useTheme();
  const index = useBreakpointIndex();
  const recipe = useSv(definition);
  const coats = useMemo(
    () => ({
      focus: coat(states?.focus, index, theme),
      hover: coat(states?.hover, index, theme),
      press: coat(states?.press, index, theme),
    }),
    [states, theme, index],
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
  const layers = useMemo(() => (WEB ? null : splitBoxLayers(painted, scope)), [painted, scope]);

  // Under `painted`, never over it: a control that states its own cursor - a
  // resize seam asking for `col-resize` - has to keep it.
  const cursor = pointerCursor(disabled, actionable);
  // Under `painted` as well: a control that states its own transition keeps it.
  const dressed = useMemo(
    () => (WEB ? [COLOUR_MOTION, cursor, NO_OUTLINE, painted] : painted),
    [cursor, painted],
  );

  return { dressed, focusedStyle, hoveredStyle, layers, paintedPressed, resolve, rest };
}

const focusRing = (token: RingToken, scope: StyleScope = DEFAULT_STYLE_SCOPE) =>
  sharedStyle(`focusable:ring:${token}`, { ...activeTheme(scope.theme).ring[token] }, scope);

function useFocusRing(token: RingToken) {
  const scope = useStyleScope();
  return focusRing(token, scope);
}

interface CoatStack {
  base: StyleProp<ViewStyle>;
  hovered: boolean;
  hoveredStyle: ViewStyle | undefined;
  pressed: boolean;
  pressedStyle: StyleProp<ViewStyle>;
  focusVisible: boolean;
  focusedStyle: ViewStyle | undefined;
  lifted: boolean;
  showRing: boolean;
  ringToken: RingToken;
  animated: StyleProp<ViewStyle>;
}

function coatStack(at: CoatStack, scope: StyleScope = DEFAULT_STYLE_SCOPE): StyleProp<ViewStyle>[] {
  return [
    at.base,
    at.hovered ? at.hoveredStyle : null,
    at.pressed ? at.pressedStyle : null,
    at.focusVisible ? at.focusedStyle : null,
    at.lifted ? LIFTED : GROUNDED,
    at.showRing && at.focusVisible ? focusRing(at.ringToken, scope) : null,
    at.animated,
  ];
}

function useCoatStack(at: CoatStack) {
  const scope = useStyleScope();
  return coatStack(at, scope);
}

export { coatStack, focusRing, useCoatStack, useFocusablePaint, useFocusRing };
