// The one focusable primitive. Every remote-reachable control on every platform
// is this component.
//
// It is a node of the SPATIAL NAVIGATOR (react-tv-space-navigation, built on the
// BBC's LRUD), not a natively focusable view, and that distinction is the whole
// reason the remote behaves. A television's own focus engine picks the next
// control by distance, re-resolves while a scroll view animates, and treats a
// focus guide as a candidate in every direction: Down from a hero button lands
// on the second tile instead of the one beneath it, Up comes back to a different
// button than the one you left, and a press with no target teleports you to the
// top of the screen. All of that was measured on an Apple TV, and none of it is
// configurable.
//
// The navigator decides instead, from the tree: a row is a row because it is
// declared as one, so Up and Down move between rows and Left and Right within
// one. The same engine runs on Apple TV, Android TV, Tizen, webOS and the
// desktop shell, so there is one behaviour to reason about rather than two.
//
// Ring and scale are applied to the SAME element, because a box-shadow scales
// with its element's transform: ring one view but scale a child and the amber
// outline would visibly detach from the artwork it is meant to outline.

import {
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  type Insets,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  type View,
  type ViewStyle,
} from 'react-native';
import {
  DefaultFocus,
  SpatialNavigationFocusableView,
  type SpatialNavigationNodeRef,
} from 'react-tv-space-navigation';
import { splitBoxLayers } from '#ui/lib/box-layers';
import { focusSettled, markFocusSettled } from '#ui/lib/focus-entry';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { useFocusReport } from '#ui/lib/focus-report';
import { useRevealOnFocus } from '#ui/lib/focus-scroll';
import { useFocusScale, usePressScale } from '#ui/lib/focus-transition';
import { UNFOCUSABLE } from '#ui/lib/focus-types';
import { inputHeld } from '#ui/lib/input-gate';
import { markFocus } from '#ui/lib/perf';
import { pressGuardActive } from '#ui/lib/press-guard';
import { ring } from '#ui/lib/tokens';

/** The browser targets (Tizen, webOS, desktop) resolve react-native to
 * react-native-web. */
const WEB = Platform.OS === 'web';

/** The navigator's `style` type follows whichever react-native copy the consuming
 * app resolves (the tvos fork on a TV, mainline on the phone), and those two are
 * not assignable to each other. Flatten once, here. */
type NavigatorStyle = ComponentProps<typeof SpatialNavigationFocusableView>['style'];
const flat = (style: StyleProp<ViewStyle>[]): NavigatorStyle =>
  StyleSheet.flatten(style) as NavigatorStyle;

/** Same story for the props the navigator spreads onto its view, which is also
 * where this file smuggles a `ref` in - see the call site. */
type NavigatorViewProps = ComponentProps<typeof SpatialNavigationFocusableView>['viewProps'];

interface FocusState {
  focused: boolean;
  pressed: boolean;
}

interface FocusableProps {
  onPress?: () => void;
  /** A touch-only long press (an episode row's context menu). The navigator has
   *  no long-press to forward, so on a remote this never fires. */
  onLongPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** The pointer entered the control. Virtual-focus surfaces (the player
   *  chrome) move their own highlight here; unused everywhere else. */
  onHoverIn?: () => void;
  /** Declare this the screen's entry point: where focus lands when it opens. */
  autoFocus?: boolean;
  disabled?: boolean;
  /**
   * CONTROLLED focus: pass this and the control leaves the navigator entirely.
   * It stops being a node (and tells the platform focus engine to skip it -
   * see organisms/player/lib/virtual-focus.ts for why that matters on tvOS)
   * and paints its focus states - ring, `focusedStyle`, scale - from this prop
   * instead of from an engine. The player chrome owns its focus this way: the
   * panel's own navigation decides which control is lit, and the control
   * renders what it is told.
   */
  focused?: boolean;
  /** Extra touchable area past the box, for small targets under a thumb. */
  hitSlop?: number | Insets;
  /** Scale while focused. The design uses 1.06 for rail tiles, 1.05 for posters
   *  and 1.04 for the primary action; 1 (the default) means "ring only". */
  focusScale?: number;
  /** Draw the signature amber ring while focused. Turn off for controls that
   *  ring an inner element instead (a cast face rings its avatar, not the card). */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Merged on top of `style` while focused. */
  focusedStyle?: StyleProp<ViewStyle>;
  /** Merged on top of `style` while a FINGER is down (the touch counterpart of
   *  `focusedStyle`; a brightened fill, usually). Touch targets also dip to the
   *  design's press scale automatically - see usePressScale. */
  pressedStyle?: StyleProp<ViewStyle>;
  children?: ReactNode | ((state: FocusState) => ReactNode);
  /** Accessibility label; also the tvOS VoiceOver name. */
  label?: string;
  ref?: Ref<ComponentRef<typeof View>>;
}

/** The ring lift, hoisted: a module constant object is one styleq cache entry
 * rather than a fresh miss on every focused render. */
const FOCUS_RING = { boxShadow: ring.focusLift } as const;

/**
 * The pressable form of a control: same box, same press, no navigator node.
 *
 * A plain function rather than a component, so the element tree is exactly what
 * the two branches used to return inline - the kit's most instantiated
 * primitive gains no extra layer from the extraction.
 */
function touchForm(at: {
  boxRef: (view: View | null) => void;
  label: string | undefined;
  style: FocusableProps['style'];
  focusedStyle: FocusableProps['focusedStyle'];
  animated: FocusableProps['style'];
  showRing: boolean;
  pressedStyle: FocusableProps['pressedStyle'];
  onPress: () => void;
  onLongPress: FocusableProps['onLongPress'];
  onHoverIn: FocusableProps['onHoverIn'];
  hitSlop: FocusableProps['hitSlop'];
  /** Controlled controls report the owner's `focused`; unscoped ones can never
   *  be focused, so their children are always told `false`. */
  controlled: boolean;
  focused: boolean;
  children: FocusableProps['children'];
}): ReactNode {
  // The coats are built HERE rather than at the call site: only a controlled
  // control can look focused, so the focus layers belong with the branch that
  // knows that, not in the caller's argument list.
  const lit = at.controlled && at.focused;
  const base = at.controlled
    ? [at.style, lit ? at.focusedStyle : null, lit && at.showRing ? FOCUS_RING : null, at.animated]
    : [at.style, at.animated];
  return (
    <TouchPressable
      boxRef={at.boxRef}
      label={at.label}
      base={base}
      pressedStyle={at.pressedStyle}
      onPress={at.onPress}
      onLongPress={at.onLongPress}
      onHoverIn={at.onHoverIn}
      hitSlop={at.hitSlop}
      {...(at.controlled ? { unfocusable: true } : null)}
    >
      {(pressed) =>
        typeof at.children === 'function'
          ? at.children({ focused: at.controlled ? at.focused : false, pressed })
          : at.children
      }
    </TouchPressable>
  );
}

/**
 * The navigator form: the control as a focusable node the remote can reach.
 *
 * A plain function, like `touchForm`, so the element tree is exactly what
 * <Focusable> used to return inline.
 */
function navigatorForm(at: {
  entry: RefObject<SpatialNavigationNodeRef | null>;
  layers: ReturnType<typeof splitBoxLayers> | null;
  style: FocusableProps['style'];
  focusedStyle: FocusableProps['focusedStyle'];
  animated: FocusableProps['style'];
  showRing: boolean;
  focused: boolean;
  press: () => void;
  pointerPress: () => void;
  handleFocus: () => void;
  handleBlur: () => void;
  setBox: (view: View | null) => void;
  label: string | undefined;
  pressedStyle: FocusableProps['pressedStyle'];
  onLongPress: FocusableProps['onLongPress'];
  hitSlop: FocusableProps['hitSlop'];
  children: FocusableProps['children'];
}): ReactNode {
  const painted = [
    at.layers ? at.layers.face : at.style,
    at.focused ? at.focusedStyle : null,
    at.showRing && at.focused ? FOCUS_RING : null,
    at.animated,
  ];

  return (
    <SpatialNavigationFocusableView
      ref={at.entry}
      onSelect={at.press}
      onFocus={at.handleFocus}
      onBlur={at.handleBlur}
      // On the browser targets the control is ONE element: the navigator's own
      // view carries the design's box. A television renders hundreds of these,
      // and a second view per control (plus the Pressable that used to wrap it)
      // is a cost Tizen pays on every focus move. The native builds keep the
      // inner view because their focus scale is a real Animated value, so there
      // this view carries the box the parent lays out and the inner one the face.
      style={WEB ? flat(painted) : (at.layers?.box as NavigatorStyle)}
      // The `ref` rides in with the other view props: React 19 carries one
      // through a spread like any other prop, and this object is spread straight
      // onto the navigator's view.
      viewProps={
        {
          accessibilityRole: 'button',
          accessibilityLabel: at.label,
          ref: at.setBox,
        } as NavigatorViewProps
      }
    >
      {({ isFocused }: { isFocused: boolean }) => {
        const render = (pressed: boolean) =>
          typeof at.children === 'function'
            ? at.children({ focused: isFocused, pressed })
            : at.children;
        if (WEB) return <>{render(false)}</>;
        return (
          <Painted
            painted={painted}
            pressedStyle={at.pressedStyle}
            onPress={at.pointerPress}
            onLongPress={at.onLongPress}
            hitSlop={at.hitSlop}
            render={render}
          />
        );
      }}
    </SpatialNavigationFocusableView>
  );
}

function Focusable({
  onPress,
  onLongPress,
  onFocus,
  onBlur,
  onHoverIn,
  autoFocus,
  disabled = false,
  focused: controlledFocus,
  hitSlop,
  focusScale = 1,
  ring: showRing = true,
  style,
  focusedStyle,
  pressedStyle,
  children,
  label,
  ref,
}: Readonly<FocusableProps>) {
  const [selfFocused, setSelfFocused] = useState(false);
  /** Controlled mode: the caller says what focused is; the navigator is out. */
  const controlled = controlledFocus !== undefined;
  const focused = controlled ? controlledFocus : selfFocused;
  const animated = useFocusScale(focused, focusScale);
  /** Is a navigator mounted above us at all? See the unscoped return below. */
  const scoped = useInsideFocusScope();

  // The control's own box, and the fallback the page scrolls to when this
  // control is in no row of its own (a settings list, a grid cell). It is the
  // navigator's view on every target, and `viewProps` is the only door to it.
  const box = useRef<View>(null);
  // The caller's ref rides along with the internal one (a trigger measures
  // itself to anchor the menu it opens).
  const setBox = useCallback(
    (view: View | null) => {
      box.current = view;
      if (typeof ref === 'function') ref(view);
      else if (ref) ref.current = view;
    },
    [ref],
  );
  const reveal = useRevealOnFocus(box);
  // A virtualised row listens for this to learn which item is selected.
  const report = useFocusReport();

  const handleFocus = useCallback(() => {
    markFocus();
    // The screen now has a focus owner, so a control that mounts later must not
    // take it away. See lib/focus-entry.
    markFocusSettled();
    setSelfFocused(true);
    reveal();
    report?.();
    onFocus?.();
  }, [onFocus, reveal, report]);

  const handleBlur = useCallback(() => {
    setSelfFocused(false);
    onBlur?.();
  }, [onBlur]);

  // The OK guard lives here rather than in the navigator: this is the single
  // choke point that can swallow the tail of the press that opened the screen,
  // which the remote's key repeat would otherwise deliver to whatever the new
  // screen focused. It is also where a held remote stops - on native, Select
  // reaches a focused control through the platform, not through the navigator,
  // so an overlay cannot keep it out any other way.
  const press = useCallback(() => {
    if (disabled || inputHeld() || pressGuardActive()) return;
    onPress?.();
  }, [disabled, onPress]);

  // Is this control the screen's entry point, or is it just mounting late?
  //
  // Decided ONCE, at mount, and never revisited: `autoFocus` asks for the focus
  // a screen opens with, and a control that mounts while focus already has an
  // owner is not that. A virtualised rail is where the difference shows - it
  // unmounts a tile that leaves the render window and mounts it again when it
  // comes back, so an auto-focused first tile used to snatch the focus the
  // moment the row scrolled back to it (walk right, press left, and you were
  // teleported to the start of the row). See lib/focus-entry.
  const [isEntry] = useState(() => autoFocus === true && !focusSettled());

  // `<DefaultFocus>` decides where a screen opens, and it decides it when the
  // tree is first built - which is too early for a control that arrives with its
  // data (the profile list from storage, the hero from the server). Those
  // screens opened with nothing highlighted at all. So the entry ALSO asks for
  // focus itself, once, when it mounts.
  const entry = useRef<SpatialNavigationNodeRef>(null);
  useEffect(() => {
    if (!isEntry) return;
    // Next tick, not this one: the node registers itself as focusable during the
    // same commit, and asking too early throws "trying to assign focus to a non
    // focusable node". The try/catch covers the screen that is torn down in
    // between - it is a request, never a requirement.
    const soon = setTimeout(() => {
      try {
        entry.current?.focus();
      } catch {
        // The screen went away first; whatever is there now keeps the focus.
      }
    }, 0);
    return () => clearTimeout(soon);
  }, [isEntry]);

  /**
   * A press that arrived from a POINTER rather than the remote.
   *
   * It moves the ring before it acts. A click reaches a control the navigator
   * does not think is focused, and firing it without moving focus leaves the
   * highlight on whatever the remote left it on - so the next arrow press
   * carries on from THERE, which reads as the remote losing its place. Focus
   * first, then the same guarded press the remote uses.
   */
  const pointerPress = useCallback(() => {
    try {
      entry.current?.focus();
    } catch {
      // Not a focusable node (yet, or any more); the press itself still stands.
    }
    press();
  }, [press]);

  // Native renders the control as two views, so the half of the style that says
  // how the PARENT places this control has to ride on the outer one; the web
  // targets have a single view and keep the style whole. Memoised because the
  // call sites hand down module-level style constants and a television renders
  // hundreds of these.
  const layers = useMemo(() => (WEB ? null : splitBoxLayers(style)), [style]);

  // A disabled control is not a node at all, so the remote walks straight past
  // it rather than stopping on something that does nothing.
  if (disabled) {
    return (
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel={label}
        aria-disabled
        style={[style, focused ? focusedStyle : null, animated]}
      >
        {typeof children === 'function' ? children({ focused, pressed: false }) : children}
      </Animated.View>
    );
  }

  // The two pressable forms, which differ only in what can make them look
  // focused:
  //
  // CONTROLLED - the caller's `focused` drives every focus visual and the
  //   navigator is out of it; the pointer still reports through `onHoverIn` so
  //   the owner can move its highlight to what the mouse is over.
  // UNSCOPED - no <FocusScope> above, so there is no navigator to register
  //   with and nothing that can focus this at all. A phone app has none on
  //   purpose, and a plain web page embedding one control should not have to
  //   mount a focus engine to show a button.
  //
  // Unscoped on a TELEVISION is deliberately NOT handled here: registering with
  // a navigator that is not there throws at render, which is the correct
  // outcome - an unscoped TV screen is a screen the remote cannot reach, and
  // the crash is the diagnosis.
  if (controlled || (!scoped && !Platform.isTV)) {
    return touchForm({
      boxRef: setBox,
      label,
      style,
      focusedStyle,
      animated,
      showRing,
      pressedStyle,
      onPress: press,
      onLongPress,
      onHoverIn,
      hitSlop,
      controlled,
      focused,
      children,
    });
  }

  // Built AFTER the early returns above, not before them: a phone, a plain web
  // page and every controlled control take one of those paths and never touch
  // the navigator node, so constructing it first made the kit's most
  // instantiated component pay for a SpatialNavigationFocusableView and a child
  // render closure on every render that could not use them.
  const node = navigatorForm({
    entry,
    layers,
    style,
    focusedStyle,
    animated,
    showRing,
    focused,
    press,
    pointerPress,
    handleFocus,
    handleBlur,
    setBox,
    label,
    pressedStyle,
    onLongPress,
    hitSlop,
    children,
  });

  return isEntry ? <DefaultFocus>{node}</DefaultFocus> : node;
}

/**
 * Televisions that have a POINTER, which is only ever Android.
 *
 * Android TV boxes ship air mice and trackpad remotes, the emulator has a real
 * mouse, and a click on those did nothing at all: the control was a plain view.
 * tvOS has no pointer device in the first place, so it keeps the plain view and
 * none of the Pressable's cost - a television renders hundreds of these.
 */
const TV_HAS_POINTER = Platform.isTV && Platform.OS === 'android';

/**
 * The view the kit styles, and the one place a TOUCH is handled.
 *
 * The navigator answers to a remote and, in a browser, to a click - but not to a
 * finger, because it has no reason to: it is a television library. The phone
 * app uses these same components, so on a build that is not a TV the styled view
 * is a Pressable and a tap activates the control.
 *
 * On a television the Pressable is `unfocusable`, and that word is doing all the
 * work: what breaks a TV is a view the PLATFORM can focus, because it swallows
 * the directional presses and the remote goes dead (see lib/focus-root). Being
 * untouchable was never the requirement, and the two are separable -
 * `UNFOCUSABLE` is `focusable: false, isTVSelectable: false`, so the box takes
 * clicks while staying outside the platform's focus order entirely.
 */
function Painted({
  painted,
  pressedStyle,
  onPress,
  onLongPress,
  hitSlop,
  render,
}: Readonly<{
  painted: StyleProp<ViewStyle>[];
  pressedStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  hitSlop?: number | Insets;
  render: (pressed: boolean) => ReactNode;
}>) {
  if (Platform.isTV && !TV_HAS_POINTER) {
    return <Animated.View style={painted}>{render(false)}</Animated.View>;
  }
  // A phone, or an Android TV with a mouse: the navigator answers to a remote
  // and to a click, but not to a finger. This is the only place a tap becomes a
  // press.
  return (
    <TouchPressable
      base={painted}
      pressedStyle={pressedStyle}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={hitSlop}
      unfocusable={Platform.isTV}
    >
      {(pressed) => render(pressed)}
    </TouchPressable>
  );
}

/**
 * The pressable the touch platforms share (the phone's half of `Painted`, and
 * the whole control when no navigator is mounted): it owns the pressed state,
 * runs the design's press dip, and paints `pressedStyle` while the finger is
 * down - the touch equivalent of the focus ring + scale.
 */
function TouchPressable({
  base,
  pressedStyle,
  onPress,
  onLongPress,
  onHoverIn,
  hitSlop,
  unfocusable = false,
  label,
  boxRef,
  children,
}: Readonly<{
  base: StyleProp<ViewStyle>[];
  pressedStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  onHoverIn?: () => void;
  hitSlop?: number | Insets;
  unfocusable?: boolean;
  label?: string;
  boxRef?: Ref<View>;
  children: (pressed: boolean) => ReactNode;
}>) {
  const dip = usePressScale();
  return (
    <AnimatedPressable
      ref={boxRef}
      {...(unfocusable ? (UNFOCUSABLE as object) : null)}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onHoverIn={onHoverIn}
      hitSlop={hitSlop}
      onPressIn={dip.onPressIn}
      onPressOut={dip.onPressOut}
      style={[...base, dip.pressed ? pressedStyle : null, dip.style]}
    >
      {children(dip.pressed)}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type { FocusableProps, FocusState };
export { Focusable };
