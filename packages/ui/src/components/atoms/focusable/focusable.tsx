// The one focusable primitive: a node of the spatial navigator
// (react-tv-space-navigation), never a natively focusable view.
//
// Ring and scale are applied to the SAME element, because a box-shadow scales
// with its element's transform: ring one view but scale a child and the outline
// visibly detaches from the artwork it outlines.

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

const WEB = Platform.OS === 'web';

// The navigator's `style` type follows whichever react-native copy the consuming
// app resolves (the tvos fork on a TV, mainline on the phone), and those two are
// not assignable to each other.
type NavigatorStyle = ComponentProps<typeof SpatialNavigationFocusableView>['style'];
const flat = (style: StyleProp<ViewStyle>[]): NavigatorStyle =>
  StyleSheet.flatten(style) as NavigatorStyle;

type NavigatorViewProps = ComponentProps<typeof SpatialNavigationFocusableView>['viewProps'];

interface FocusState {
  focused: boolean;
  pressed: boolean;
}

interface FocusableProps {
  onPress?: () => void;
  onLongPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onHoverIn?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Controlled focus: the control leaves the navigator entirely and paints its
   *  focus states from this prop. */
  focused?: boolean;
  hitSlop?: number | Insets;
  focusScale?: number;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  hoveredStyle?: StyleProp<ViewStyle>;
  children?: ReactNode | ((state: FocusState) => ReactNode);
  label?: string;
  ref?: Ref<ComponentRef<typeof View>>;
}

// A module constant object is one styleq cache entry rather than a fresh miss on
// every focused render.
const FOCUS_RING = { boxShadow: ring.focusLift } as const;

function touchForm(at: {
  boxRef: (view: View | null) => void;
  label: string | undefined;
  style: FocusableProps['style'];
  focusedStyle: FocusableProps['focusedStyle'];
  animated: FocusableProps['style'];
  showRing: boolean;
  pressedStyle: FocusableProps['pressedStyle'];
  hoveredStyle: FocusableProps['hoveredStyle'];
  onPress: () => void;
  onLongPress: FocusableProps['onLongPress'];
  onHoverIn: FocusableProps['onHoverIn'];
  onHoverOut: () => void;
  hitSlop: FocusableProps['hitSlop'];
  controlled: boolean;
  focused: boolean;
  hovered: boolean;
  children: FocusableProps['children'];
}): ReactNode {
  const lit = at.controlled && at.focused;
  // Hover goes UNDER the focus coats: a control the cursor is over and the
  // remote is on is a focused control, not a doubly-lit one.
  const hover = at.hovered ? at.hoveredStyle : null;
  const base = at.controlled
    ? [
        at.style,
        hover,
        lit ? at.focusedStyle : null,
        lit && at.showRing ? FOCUS_RING : null,
        at.animated,
      ]
    : [at.style, hover, at.animated];
  return (
    <TouchPressable
      boxRef={at.boxRef}
      label={at.label}
      base={base}
      pressedStyle={at.pressedStyle}
      onPress={at.onPress}
      onLongPress={at.onLongPress}
      onHoverIn={at.onHoverIn}
      onHoverOut={at.onHoverOut}
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

function navigatorForm(at: {
  entry: RefObject<SpatialNavigationNodeRef | null>;
  layers: ReturnType<typeof splitBoxLayers> | null;
  style: FocusableProps['style'];
  focusedStyle: FocusableProps['focusedStyle'];
  animated: FocusableProps['style'];
  showRing: boolean;
  focused: boolean;
  hovered: boolean;
  press: () => void;
  pointerPress: () => void;
  handleFocus: () => void;
  handleBlur: () => void;
  setBox: (view: View | null) => void;
  label: string | undefined;
  pressedStyle: FocusableProps['pressedStyle'];
  hoveredStyle: FocusableProps['hoveredStyle'];
  onHoverIn: () => void;
  onHoverOut: () => void;
  onLongPress: FocusableProps['onLongPress'];
  hitSlop: FocusableProps['hitSlop'];
  children: FocusableProps['children'];
}): ReactNode {
  const painted = [
    at.layers ? at.layers.face : at.style,
    at.hovered ? at.hoveredStyle : null,
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
      // On the browser targets the control is ONE element: a second view per
      // control is a cost Tizen pays on every focus move. The native builds keep
      // the inner view because their focus scale is a real Animated value.
      style={WEB ? flat(painted) : (at.layers?.box as NavigatorStyle)}
      viewProps={
        {
          accessibilityRole: 'button',
          accessibilityLabel: at.label,
          ref: at.setBox,
          // Browser targets only: this view is a plain <View>, so there is no
          // hover callback to lean on and react-native-web forwards these two
          // straight to the element.
          ...(WEB ? { onPointerEnter: at.onHoverIn, onPointerLeave: at.onHoverOut } : null),
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
  hoveredStyle,
  children,
  label,
  ref,
}: Readonly<FocusableProps>) {
  const [selfFocused, setSelfFocused] = useState(false);
  const controlled = controlledFocus !== undefined;
  const focused = controlled ? controlledFocus : selfFocused;
  const scoped = useInsideFocusScope();

  const [hovered, setHovered] = useState(false);
  const hoverIn = useCallback(() => {
    setHovered(true);
    onHoverIn?.();
  }, [onHoverIn]);
  const hoverOut = useCallback(() => setHovered(false), []);

  // The scale answers the pointer as well as the remote: it is what carries
  // hover on artwork controls, which have no fill for `hoveredStyle` to paint.
  const animated = useFocusScale(focused || hovered, focusScale);

  const box = useRef<View>(null);
  const setBox = useCallback(
    (view: View | null) => {
      box.current = view;
      if (typeof ref === 'function') ref(view);
      else if (ref) ref.current = view;
    },
    [ref],
  );
  const reveal = useRevealOnFocus(box);
  const report = useFocusReport();

  const handleFocus = useCallback(() => {
    markFocus();
    // The screen now has a focus owner, so a control that mounts later must not
    // take it away.
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

  // The OK guard lives here, not in the navigator: on native, Select reaches a
  // focused control through the platform rather than the navigator, so this is
  // the only choke point that can swallow the tail of the press that opened
  // the screen.
  const press = useCallback(() => {
    if (disabled || inputHeld() || pressGuardActive()) return;
    onPress?.();
  }, [disabled, onPress]);

  // Decided once, at mount: `autoFocus` asks for the focus a screen opens with,
  // and a control that mounts while focus already has an owner is not that.
  // Otherwise a virtualised rail's first tile snatches focus every time the row
  // scrolls back to it.
  const [isEntry] = useState(() => autoFocus === true && !focusSettled());

  // `<DefaultFocus>` decides where a screen opens when the tree is first built,
  // which is too early for a control that arrives with its data, so the entry
  // also asks for focus itself once on mount.
  const entry = useRef<SpatialNavigationNodeRef>(null);
  useEffect(() => {
    if (!isEntry) return;
    // Next tick: the node registers itself as focusable during the same commit,
    // and asking too early throws "trying to assign focus to a non focusable
    // node".
    const soon = setTimeout(() => {
      try {
        entry.current?.focus();
      } catch {
        // The screen went away first; whatever is there now keeps the focus.
      }
    }, 0);
    return () => clearTimeout(soon);
  }, [isEntry]);

  // Moves the ring before it acts: a click reaches a control the navigator does
  // not think is focused, and acting without moving focus leaves the next arrow
  // press carrying on from wherever the remote left the highlight.
  const pointerPress = useCallback(() => {
    try {
      entry.current?.focus();
    } catch {
      // Not a focusable node (yet, or any more); the press itself still stands.
    }
    press();
  }, [press]);

  // Native renders the control as two views, so the half of the style that says
  // how the parent places this control has to ride on the outer one; the web
  // targets have a single view and keep the style whole.
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

  // Unscoped on a television is deliberately not handled here: an unscoped TV
  // screen is one the remote cannot reach, and registering with a navigator
  // that isn't there should throw at render.
  if (controlled || (!scoped && !Platform.isTV)) {
    return touchForm({
      boxRef: setBox,
      label,
      style,
      focusedStyle,
      animated,
      showRing,
      pressedStyle,
      hoveredStyle,
      onPress: press,
      onLongPress,
      onHoverIn: hoverIn,
      onHoverOut: hoverOut,
      hitSlop,
      controlled,
      focused,
      hovered,
      children,
    });
  }

  // Built after the early returns: the paths above never touch the navigator
  // node, and constructing it first made the kit's most instantiated component
  // pay for a SpatialNavigationFocusableView it could not use.
  const node = navigatorForm({
    entry,
    layers,
    style,
    focusedStyle,
    animated,
    showRing,
    focused,
    hovered,
    press,
    pointerPress,
    handleFocus,
    handleBlur,
    setBox,
    label,
    pressedStyle,
    hoveredStyle,
    onHoverIn: hoverIn,
    onHoverOut: hoverOut,
    onLongPress,
    hitSlop,
    children,
  });

  return isEntry ? <DefaultFocus>{node}</DefaultFocus> : node;
}

// Android TV boxes ship air mice and trackpad remotes; tvOS has no pointer
// device at all, so it keeps the plain view and none of the Pressable's cost.
const TV_HAS_POINTER = Platform.isTV && Platform.OS === 'android';

// On a television the Pressable must be `unfocusable`: a view the platform can
// focus swallows the directional presses and the remote goes dead (see
// lib/focus-root).
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
  // The navigator answers to a remote and to a click, but not to a finger. This
  // is the only place a tap becomes a press.
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

function TouchPressable({
  base,
  pressedStyle,
  onPress,
  onLongPress,
  onHoverIn,
  onHoverOut,
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
  onHoverOut?: () => void;
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
      onHoverOut={onHoverOut}
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
