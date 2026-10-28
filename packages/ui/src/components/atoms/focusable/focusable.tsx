// The one focusable primitive: a node of the spatial navigator, never a
// natively focusable view.
//
// Ring and scale are applied to the SAME element, because a box-shadow scales
// with its element's transform: ring one view but scale a child and the outline
// visibly detaches from the artwork it outlines.

import { DefaultFocus } from '@kromatv/spatial-nav/react';
import {
  type Ref,
  type RefObject,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { View } from 'react-native';
import type { AnySv } from '#ui/core';
import { controlForm } from '#ui/lib/control-form';
import { useCanPress } from '#ui/lib/control-platform';
import { useFocusEntry } from '#ui/lib/focus-entry';
import { useFocusLift } from '#ui/lib/focus-lift';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { useFocusReport } from '#ui/lib/focus-report';
import { useRevealOnFocusBy } from '#ui/lib/use-reveal-on-focus';
import { useFocusServices } from '#ui/lib/focus-services-context';
import { useFocusScale } from '#ui/lib/focus-transition';
import { usePlatformHoldsFocus } from '#ui/lib/focus-platform';
import { useFocusVisibleBy } from '#ui/lib/focus-visible';
import { useHoverPassthrough } from '#ui/lib/hover-passthrough';
import { useInputGate } from '#ui/lib/input-gate';
import { useKeyPress } from '#ui/lib/key-press';
import { usePerfSampler } from '#ui/lib/perf-provider';
import { useRingScope } from '#ui/lib/ring-scope';
import { claimProps } from './focusable-a11y';
import { contentFor } from './focusable-delegate';
import { DisabledForm, NavigatorForm, TouchForm } from './focusable-forms';
import { LinkForm } from './focusable-link';
import { useFocusablePaint } from './focusable-paint';
import type { A11yState, FocusableProps, TouchAt } from './focusable-types';
import { useEntryFocus } from './use-entry-focus';

function attach(box: RefObject<View | null>, outer: Ref<View> | undefined, view: View | null) {
  box.current = view;
  if (typeof outer === 'function') outer(view);
  else if (outer) outer.current = view;
}

function Focusable<R extends AnySv = AnySv>({
  asChild = false,
  sv: recipe,
  vars,
  onPress,
  onLongPress,
  onFocus,
  onBlur,
  onHoverIn,
  onLayout,
  autoFocus,
  focusHandle,
  disabled = false,
  focused: controlledFocus,
  hitSlop,
  href,
  inert = false,
  tabbable = true,
  focusScale = 1,
  ring = true,
  style,
  states,
  children,
  label,
  role = href || asChild ? 'link' : 'button',
  checked,
  selected,
  expanded,
  pressed,
  busy,
  current,
  value,
  ref,
}: Readonly<FocusableProps<R>>) {
  const { probe, mirror, source } = useFocusServices();
  const { inputHeld, pressGuardActive } = useInputGate();
  const { markFocusSettled } = useFocusEntry();
  const perf = usePerfSampler();
  const [selfFocused, setSelfFocused] = useState(false);
  const pressRef = useRef<() => void>(() => {});

  const controlled = controlledFocus !== undefined;
  const dormant = usePlatformHoldsFocus();
  const focused = (controlled ? controlledFocus : selfFocused) && !dormant;
  const focusVisible = useFocusVisibleBy(focused, source.pointerDriving);
  const scoped = useInsideFocusScope();

  const stateProps = useMemo<A11yState>(
    () => claimProps({ checked, selected, expanded, pressed, busy }, value, current),
    [checked, selected, expanded, pressed, busy, value, current],
  );

  // A surface that clips what it holds says which ring its controls draw; a
  // control standing on its own keeps the one that lifts off the page.
  const scopedRing = useRingScope();
  const ringToken = typeof ring === 'string' ? ring : (scopedRing ?? 'focusLift');
  const showRing = ring !== false;

  const webKeys = useKeyPress(
    !disabled && !inert && Boolean(onPress),
    role,
    pressRef,
    mirror,
    tabbable,
  );

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
  // A callback ref, so it re-binds when this control swaps its host element (a
  // disabled <Focusable> renders a different one).
  const passthrough = useHoverPassthrough<View>();
  const setBox = useCallback(
    (view: View | null) => {
      passthrough(view);
      attach(box, ref, view);
    },
    [passthrough, ref],
  );
  const reveal = useRevealOnFocusBy(box, source.pointerDriving);
  const report = useFocusReport();

  const handleFocus = useCallback(() => {
    // Everything between this control and the screen rises with it; a control
    // lifted inside a row is still under the NEXT row without this.
    lift?.(true);
    // Where the ring landed, for the reading-order walk Tab does.
    probe.noteFocus(box.current);
    perf?.markFocus();
    // The screen now has a focus owner, so a control that mounts later must not
    // take it away.
    markFocusSettled();
    setSelfFocused(true);
    reveal();
    report?.();
    onFocus?.();
  }, [lift, onFocus, reveal, report, perf, markFocusSettled, probe]);

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
  }, [disabled, onPress, inputHeld, pressGuardActive]);
  useLayoutEffect(() => {
    pressRef.current = press;
  });
  const longPress = useCallback(() => {
    if (disabled || inputHeld() || pressGuardActive()) return;
    onLongPress?.();
  }, [disabled, onLongPress, inputHeld, pressGuardActive]);

  const { entry, isEntry, pointerPress } = useEntryFocus(autoFocus, press);
  useImperativeHandle(focusHandle, () => ({ focus: () => entry.current?.focus() }), [entry]);

  // Whether anything downstream can report a press, so a recipe's `_press` is
  // only resolved where it can land: a pointerless television cannot.
  const canPress = useCanPress();
  const content = contentFor(asChild, children);
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
      actionable: Boolean(onPress) || asChild,
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
          children: content,
        }}
      />
    );
  }

  const at: TouchAt = {
    setBox,
    webKeys: webKeys?.pressable ?? null,
    href,
    label,
    onLayout,
    role,
    a11yState: stateProps,
    style: dressed,
    focusedStyle,
    hoveredStyle,
    pressedStyle: paintedPressed,
    animated,
    showRing,
    ringToken,
    controlled,
    focused,
    focusVisible,
    hovered,
    pressed: pointerPressed,
    hitSlop,
    onPress: press,
    onLongPress,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onHoverIn: hoverIn,
    onHoverOut: hoverOut,
    onPointerDown: pointerDown,
    onPointerUp: pointerUp,
    resolve,
    children: content,
  };

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
        ringToken,
        focused,
        focusVisible,
        hovered,
        press,
        pointerPress,
        handleFocus,
        handleBlur,
        setBox,
        mirror,
        label,
        pressed: pointerPressed,
        pressedStyle: paintedPressed,
        hoveredStyle,
        onHoverIn: hoverIn,
        onHoverOut: hoverOut,
        onPointerDown: pointerDown,
        onPointerUp: pointerUp,
        onLongPress,
        onLongSelect: onLongPress ? longPress : undefined,
        hitSlop,
        resolve,
        children: content,
      }}
    />
  );

  return controlForm({
    controlled,
    scoped,
    asChild,
    renderLink: () => <LinkForm child={children} at={at} />,
    renderTouch: () => <TouchForm at={at} />,
    renderNavigator: () => (isEntry ? <DefaultFocus>{node}</DefaultFocus> : node),
  });
}

export type { Delegate } from './focusable-delegate';
export { delegateOf } from './focusable-delegate';
export type {
  FocusableProps,
  FocusCurrent,
  FocusHandle,
  FocusState,
  HostElement,
} from './focusable-types';
export { Focusable };
