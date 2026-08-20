// The one focusable primitive: a node of the spatial navigator
// (react-tv-space-navigation), never a natively focusable view.
//
// Ring and scale are applied to the SAME element, because a box-shadow scales
// with its element's transform: ring one view but scale a child and the outline
// visibly detaches from the artwork it outlines.

import {
  type Ref,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, type View } from 'react-native';
import { DefaultFocus } from 'react-tv-space-navigation';
import type { AnySv } from '#ui/core';
import { markFocusSettled } from '#ui/lib/focus-entry';
import { noteFocus } from '#ui/lib/focus-here';
import { useFocusLift } from '#ui/lib/focus-lift';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { useFocusReport } from '#ui/lib/focus-report';
import { useRevealOnFocus } from '#ui/lib/focus-scroll';
import { useFocusScale } from '#ui/lib/focus-transition';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { inputHeld } from '#ui/lib/input-gate';
import { markFocus } from '#ui/lib/perf';
import { WEB } from '#ui/lib/platform';
import { pressGuardActive } from '#ui/lib/press-guard';
import { claimProps } from './focusable-a11y';
import { DisabledForm, NavigatorForm, TouchForm } from './focusable-forms';
import { useFocusablePaint } from './focusable-paint';
import type { A11yState, FocusableProps, FocusRole, WebKeys } from './focusable-types';
import { TV_HAS_POINTER } from './touch-pressable';
import { useEntryFocus } from './use-entry-focus';

function attach(box: RefObject<View | null>, outer: Ref<View> | undefined, view: View | null) {
  box.current = view;
  if (typeof outer === 'function') outer(view);
  else if (outer) outer.current = view;
}

function useWebKeys(
  active: boolean,
  role: FocusRole,
  press: RefObject<() => void>,
): { pressable: WebKeys; view: WebKeys } | null {
  return useMemo(() => {
    if (!WEB || !active) return null;
    const answering = (owns: (key: string) => boolean): WebKeys => ({
      tabIndex: 0,
      onKeyDown: (event) => {
        if (!owns(event.nativeEvent.key)) return;
        event.preventDefault();
        press.current();
      },
    });
    return {
      pressable: answering((key) => key === ' ' && role !== 'button'),
      view: answering((key) => key === 'Enter' || key === ' '),
    };
  }, [active, role, press]);
}

function Focusable<R extends AnySv = AnySv>({
  sv: recipe,
  vars,
  onPress,
  onLongPress,
  onFocus,
  onBlur,
  onHoverIn,
  onLayout,
  autoFocus,
  disabled = false,
  focused: controlledFocus,
  hitSlop,
  href,
  inert = false,
  focusScale = 1,
  ring: showRing = true,
  style,
  states,
  children,
  label,
  role = href ? 'link' : 'button',
  checked,
  selected,
  expanded,
  pressed,
  busy,
  current,
  value,
  ref,
}: Readonly<FocusableProps<R>>) {
  const [selfFocused, setSelfFocused] = useState(false);
  const pressRef = useRef<() => void>(() => {});

  const controlled = controlledFocus !== undefined;
  const focused = controlled ? controlledFocus : selfFocused;
  const focusVisible = useFocusVisible(focused);
  const scoped = useInsideFocusScope();

  const stateProps = useMemo<A11yState>(
    () => claimProps({ checked, selected, expanded, pressed, busy }, value, current),
    [checked, selected, expanded, pressed, busy, value, current],
  );

  const webKeys = useWebKeys(!disabled && !inert && Boolean(onPress), role, pressRef);

  const lift = useFocusLift();
  const [hovered, setHovered] = useState(false);
  const hoverIn = useCallback(() => {
    setHovered(true);
    onHoverIn?.();
  }, [onHoverIn]);
  // The navigator path renders a plain view rather than a <Pressable>, so it has
  // no onPressIn and leans on the pointer events react-native-web forwards.
  const [pointerPressed, setPointerPressed] = useState(false);
  const pointerDown = useCallback(() => setPointerPressed(true), []);
  const pointerUp = useCallback(() => setPointerPressed(false), []);
  const hoverOut = useCallback(() => {
    setHovered(false);
    setPointerPressed(false);
  }, []);

  const animated = useFocusScale(focused || hovered, focusScale);

  const box = useRef<View>(null);
  const setBox = useCallback((view: View | null) => attach(box, ref, view), [ref]);
  const reveal = useRevealOnFocus(box);
  const report = useFocusReport();

  const handleFocus = useCallback(() => {
    // Everything between this control and the screen rises with it; a control
    // lifted inside a row is still under the NEXT row without this.
    lift?.(true);
    // Where the ring landed, for the reading-order walk Tab does.
    noteFocus(box.current);
    markFocus();
    // The screen now has a focus owner, so a control that mounts later must not
    // take it away.
    markFocusSettled();
    setSelfFocused(true);
    reveal();
    report?.();
    onFocus?.();
  }, [lift, onFocus, reveal, report]);

  const handleBlur = useCallback(() => {
    lift?.(false);
    setSelfFocused(false);
    onBlur?.();
  }, [lift, onBlur]);

  // The OK guard lives here, not in the navigator: on native, Select reaches a
  // focused control through the platform rather than the navigator, so this is
  // the only choke point that can swallow the tail of the press that opened
  // the screen.
  const press = useCallback(() => {
    if (disabled || inputHeld() || pressGuardActive()) return;
    onPress?.();
  }, [disabled, onPress]);
  useLayoutEffect(() => {
    pressRef.current = press;
  });

  const { entry, isEntry, pointerPress } = useEntryFocus(autoFocus, press);

  // Whether anything downstream can report a press, so a recipe's `_press` is
  // only resolved where it can land: a pointerless television cannot.
  const canPress = WEB || !Platform.isTV || TV_HAS_POINTER;
  const { dressed, focusedStyle, hoveredStyle, layers, paintedPressed, resolve, rest } =
    useFocusablePaint({
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
    });

  // A disabled control is not a node at all, so the remote walks straight past
  // it rather than stopping on something that does nothing.
  if (disabled) {
    return (
      <DisabledForm
        at={{
          role,
          onLayout,
          disabledState: claimProps(
            { checked, selected, expanded, pressed, busy, disabled: true },
            value,
            current,
          ),
          label,
          style: dressed,
          focusedStyle,
          animated,
          focused,
          hovered,
          slots: rest,
          children,
        }}
      />
    );
  }

  // Unscoped on a television is deliberately not handled here: an unscoped TV
  // screen is one the remote cannot reach, and registering with a navigator
  // that isn't there should throw at render.
  if (controlled || (!scoped && !Platform.isTV)) {
    return (
      <TouchForm
        at={{
          boxRef: setBox,
          webKeys: webKeys?.pressable ?? null,
          href,
          label,
          onLayout,
          role,
          a11yState: stateProps,
          style: dressed,
          focusedStyle,
          animated,
          showRing,
          pressedStyle: paintedPressed,
          hoveredStyle,
          onPress: press,
          onLongPress,
          onHoverIn: hoverIn,
          onHoverOut: hoverOut,
          hitSlop,
          controlled,
          focused,
          focusVisible,
          hovered,
          resolve,
          children,
        }}
      />
    );
  }

  const node = (
    <NavigatorForm
      entry={entry}
      at={{
        onLayout,
        webKeys: webKeys?.view ?? null,
        href,
        layers,
        style: dressed,
        role,
        a11yState: stateProps,
        focusedStyle,
        animated,
        showRing,
        focused,
        focusVisible,
        hovered,
        press,
        pointerPress,
        handleFocus,
        handleBlur,
        setBox,
        label,
        pressed: pointerPressed,
        pressedStyle: paintedPressed,
        hoveredStyle,
        onHoverIn: hoverIn,
        onHoverOut: hoverOut,
        onPointerDown: pointerDown,
        onPointerUp: pointerUp,
        onLongPress,
        hitSlop,
        resolve,
        children,
      }}
    />
  );

  return isEntry ? <DefaultFocus>{node}</DefaultFocus> : node;
}

export type { FocusableProps, FocusCurrent, FocusState } from './focusable-types';
export { Focusable };
