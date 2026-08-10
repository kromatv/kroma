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
  type AccessibilityRole,
  type AccessibilityState,
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
import {
  type AnySv,
  activeTheme,
  normalize,
  type StyleDecl,
  type SvStateName,
  sharedStyle,
  stabilise,
} from '#ui/core';
import { splitBoxLayers } from '#ui/lib/box-layers';
import { focusSettled, markFocusSettled } from '#ui/lib/focus-entry';
import { noteFocus } from '#ui/lib/focus-here';
import { LIFTED, useFocusLift } from '#ui/lib/focus-lift';
import { useInsideFocusScope } from '#ui/lib/focus-presence';
import { useFocusReport } from '#ui/lib/focus-report';
import { useRevealOnFocus } from '#ui/lib/focus-scroll';
import { useFocusScale, usePressScale } from '#ui/lib/focus-transition';
import { UNFOCUSABLE } from '#ui/lib/focus-types';
import { useFocusVisible } from '#ui/lib/focus-visible';
import { inputHeld } from '#ui/lib/input-gate';
import { markFocus } from '#ui/lib/perf';
import { pressGuardActive } from '#ui/lib/press-guard';

const WEB = Platform.OS === 'web';

// The navigator's `style` type follows whichever react-native copy the consuming
// app resolves (the tvos fork on a TV, mainline on the phone), and those two are
// not assignable to each other.
type NavigatorStyle = ComponentProps<typeof SpatialNavigationFocusableView>['style'];
const flat = (style: StyleProp<ViewStyle>[]): NavigatorStyle =>
  StyleSheet.flatten(style) as NavigatorStyle;

type NavigatorViewProps = ComponentProps<typeof SpatialNavigationFocusableView>['viewProps'];

/**
 * What a child render function is handed.
 *
 * `slots` is the recipe resolved against the live interaction state, so a child
 * spends finished values rather than re-deriving them from booleans: an <Icon>
 * gets `{...s.icon}` where it used to get `color={ink(focused)}` out of a lookup
 * table beside the component.
 */
// `option` is not in React Native's union: react-native-web passes it through
// to the ARIA role a listbox row needs, but Android's accessibility delegate
// THROWS on it, so the native forms swap it for the nearest legal role and
// keep the selected state (see `platformRole`).
type FocusRole = AccessibilityRole | 'option';

/** The accessibility state, in whichever shape the platform reads (see the
 *  comment where it is built). */
type A11yState =
  | undefined
  | { accessibilityState: AccessibilityState }
  | {
      'aria-checked': boolean | 'mixed' | undefined;
      'aria-selected': boolean | undefined;
      'aria-expanded': boolean | undefined;
    };

/** What the platform can be handed: the web keeps the real ARIA role, native
 *  gets the nearest value Android's `fromValue` accepts. */
function platformRole(role: FocusRole): AccessibilityRole {
  if (WEB) return role as AccessibilityRole;
  return role === 'option' ? 'menuitem' : role;
}

interface FocusState<R extends AnySv = AnySv> {
  focused: boolean;
  pressed: boolean;
  hovered: boolean;
  /** The recipe resolved against the live state. Empty when no `sv` was given. */
  slots: ReturnType<R>;
}

interface FocusableProps<R extends AnySv = AnySv> {
  /**
   * The component's recipe. <Focusable> owns the interaction state, so it is the
   * only place that can resolve one: it paints the `root` slot on itself and
   * hands the rest to `children`.
   */
  sv?: R;
  /** The variant picks to resolve `sv` with, typed to the recipe's own groups. */
  vars?: Parameters<R>[0];
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
  /** Reachable by the remote, but painting no interaction state: a control that
   *  is busy rather than unavailable. A spinner already says what is happening,
   *  and a hover highlight would promise a press that is not being taken. */
  inert?: boolean;
  focusScale?: number;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * One-off state layers, in the recipe vocabulary, merged over whatever `sv`
   * resolves. What `style` is to the rest state, this is to the others.
   */
  states?: Partial<Record<SvStateName, StyleDecl>>;
  children?: ReactNode | ((state: FocusState<R>) => ReactNode);
  label?: string;
  /** What the control IS to assistive tech. Defaults to `button`; a control
   *  with its own semantics (`switch`, `radio`, `tab`, ...) says so here and
   *  pairs it with `checked`/`selected`/`expanded` below. `option` is not in
   *  React Native's union but passes through react-native-web to the ARIA
   *  role a listbox row needs; native platforms ignore it harmlessly. */
  role?: FocusRole;
  /** `role="switch" | "checkbox" | "radio"` state, announced as `aria-checked`. */
  checked?: boolean | 'mixed';
  /** `role="tab"`/listbox-option state, announced as `aria-selected`. */
  selected?: boolean;
  /** A disclosure trigger's open state, announced as `aria-expanded`. */
  expanded?: boolean;
  ref?: Ref<ComponentRef<typeof View>>;
}

/** Resolves the recipe for one value of `pressed`, which is the only part of the
 *  state the outer render cannot see - a Pressable reports it from inside. */
type Resolve = (pressed: boolean) => ReturnType<AnySv>;

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

/**
 * `[a, b]` that keeps its identity while `a` and `b` keep theirs.
 *
 * This is NOT about styleq's cache: styleq walks arrays transparently and keys
 * its WeakMap on each LEAF style object, so a fresh wrapper around stable leaves
 * still hits. What it protects is `splitBoxLayers`, which <Focusable> memoises
 * on this value and which does a full flatten plus two allocations on the native
 * path - that would otherwise re-run on every render.
 *
 * The common cases cost nothing: no recipe hands back `b` untouched, and no
 * caller style hands back `a`, neither needing an array at all.
 */
function usePair(a: StyleProp<ViewStyle>, b: StyleProp<ViewStyle>): StyleProp<ViewStyle> {
  return useMemo(() => {
    if (a == null) return b;
    return b == null ? a : [a, b];
  }, [a, b]);
}

// Shared by identity per theme rather than minted per focused render: styleq
// keys its cache on the object, and the ring follows the theme's accent.
const focusRing = () => sharedStyle('focusable:ring', { ...activeTheme().ring.focusLift });

/** Tab reachability, plus whichever activation keys the form underneath does
 *  not already answer, on the web; null elsewhere. */
type WebKeys = {
  tabIndex: number;
  onKeyDown: (event: { nativeEvent: { key: string }; preventDefault: () => void }) => void;
} | null;

function touchForm(at: {
  boxRef: (view: View | null) => void;
  webKeys: WebKeys;
  label: string | undefined;
  role: FocusRole;
  a11yState: A11yState;
  style: FocusableProps['style'];
  focusedStyle: ViewStyle | undefined;
  animated: FocusableProps['style'];
  showRing: boolean;
  pressedStyle: StyleProp<ViewStyle>;
  hoveredStyle: ViewStyle | undefined;
  onPress: () => void;
  onLongPress: FocusableProps['onLongPress'];
  onHoverIn: FocusableProps['onHoverIn'];
  onHoverOut: () => void;
  hitSlop: FocusableProps['hitSlop'];
  controlled: boolean;
  focused: boolean;
  focusVisible: boolean;
  hovered: boolean;
  resolve: Resolve;
  children: FocusableProps['children'];
}): ReactNode {
  const lit = at.controlled && at.focusVisible;
  // Hover goes UNDER the focus coats: a control the cursor is over and the
  // remote is on is a focused control, not a doubly-lit one.
  const hover = at.hovered ? at.hoveredStyle : null;
  const base = at.controlled
    ? [
        at.style,
        hover,
        lit ? at.focusedStyle : null,
        lit ? LIFTED : null,
        lit && at.showRing ? focusRing() : null,
        at.animated,
      ]
    : [at.style, hover, at.animated];
  return (
    <TouchPressable
      boxRef={at.boxRef}
      webKeys={at.webKeys}
      label={at.label}
      role={at.role}
      a11yState={at.a11yState}
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
          ? at.children({
              focused: at.controlled ? at.focused : false,
              pressed,
              hovered: at.hovered,
              slots: at.resolve(pressed),
            })
          : at.children
      }
    </TouchPressable>
  );
}

function navigatorForm(at: {
  entry: RefObject<SpatialNavigationNodeRef | null>;
  webKeys: WebKeys;
  layers: ReturnType<typeof splitBoxLayers> | null;
  style: FocusableProps['style'];
  focusedStyle: ViewStyle | undefined;
  animated: FocusableProps['style'];
  showRing: boolean;
  focused: boolean;
  focusVisible: boolean;
  hovered: boolean;
  press: () => void;
  pointerPress: () => void;
  handleFocus: () => void;
  handleBlur: () => void;
  setBox: (view: View | null) => void;
  label: string | undefined;
  role: FocusRole;
  a11yState: A11yState;
  pressedStyle: StyleProp<ViewStyle>;
  hoveredStyle: ViewStyle | undefined;
  onHoverIn: () => void;
  onHoverOut: () => void;
  onLongPress: FocusableProps['onLongPress'];
  hitSlop: FocusableProps['hitSlop'];
  resolve: Resolve;
  children: FocusableProps['children'];
}): ReactNode {
  const painted = [
    at.layers ? at.layers.face : at.style,
    at.hovered ? at.hoveredStyle : null,
    at.focusVisible ? at.focusedStyle : null,
    // Above its neighbours for as long as it holds focus. react-native-web
    // gives every view an explicit `z-index: 0`, so equal siblings paint in DOM
    // order and the NEXT tile in a row draws over the ring and the focus scale
    // of the one before it. Keyed on `focused`, not `focusVisible`: the lift is
    // about what is selected, not about which input selected it.
    at.focused ? LIFTED : null,
    at.showRing && at.focusVisible ? focusRing() : null,
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
          accessibilityRole: platformRole(at.role),
          ...(at.a11yState as object | undefined),
          ...(at.webKeys ?? null),
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
            ? at.children({
                focused: isFocused,
                pressed,
                hovered: at.hovered,
                slots: at.resolve(pressed),
              })
            : at.children;
        if (WEB) return <>{render(false)}</>;
        return (
          <Painted
            painted={painted}
            pressedStyle={at.pressedStyle}
            onPress={at.pointerPress}
            onLongPress={at.onLongPress}
            hitSlop={at.hitSlop}
            role={at.role}
            a11yState={at.a11yState}
            render={render}
          />
        );
      }}
    </SpatialNavigationFocusableView>
  );
}

function Focusable<R extends AnySv = AnySv>({
  sv: recipe,
  vars,
  onPress,
  onLongPress,
  onFocus,
  onBlur,
  onHoverIn,
  autoFocus,
  disabled = false,
  focused: controlledFocus,
  hitSlop,
  inert = false,
  focusScale = 1,
  ring: showRing = true,
  style,
  states,
  children,
  label,
  role = 'button',
  checked,
  selected,
  expanded,
  ref,
}: Readonly<FocusableProps<R>>) {
  const [selfFocused, setSelfFocused] = useState(false);
  const pressRef = useRef<() => void>(() => {});
  // Whether the focus is one the viewer asked for, in the browser's own
  // `:focus-visible` sense. The navigator focuses on mouse-enter once a pointer
  // has moved (react-tv-space-navigation FocusableView.tsx) and never blurs on
  // leave, because its model keeps exactly one owner - so a swept cursor would
  // otherwise leave the amber ring parked on whatever it passed last. Hover has
  // its own reading; the ring is the remote's.

  const controlled = controlledFocus !== undefined;
  const focused = controlled ? controlledFocus : selfFocused;
  const focusVisible = useFocusVisible(focused);
  const scoped = useInsideFocusScope();

  // React Native reads the `accessibilityState` OBJECT; react-native-web reads
  // flat `aria-*` props and ignores that object entirely, which is how every
  // control's checked state was being dropped on the web. Emit the shape each
  // platform actually reads.
  const a11yState = useMemo<A11yState>(() => {
    if (checked === undefined && selected === undefined && expanded === undefined) return undefined;
    if (WEB) {
      return {
        'aria-checked': checked,
        'aria-selected': selected,
        'aria-expanded': expanded,
      };
    }
    return { accessibilityState: { checked, selected, expanded } };
  }, [checked, selected, expanded]);

  const webKeys = useMemo(() => {
    if (!WEB) return null;
    if (disabled || inert || !onPress) return null;
    const answering = (owns: (key: string) => boolean): WebKeys => ({
      tabIndex: 0,
      onKeyDown: (event) => {
        if (!owns(event.nativeEvent.key)) return;
        event.preventDefault();
        pressRef.current();
      },
    });
    return {
      pressable: answering((key) => key === ' ' && role !== 'button'),
      view: answering((key) => key === 'Enter' || key === ' '),
    };
  }, [disabled, inert, onPress, role]);

  const lift = useFocusLift();
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
  // The keyboard handler is built before `press` exists and must never hold a
  // stale one.
  pressRef.current = press;

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

  // The recipe, resolved against the live state.
  //
  // `pressed` is the one flag the outer render cannot see - a Pressable reports
  // it from inside - so the pressed answer is a function rather than a value,
  // and it is only ever built if something actually presses. The rest state is
  // computed once and reused, because it is what the outer render paints with
  // and what every unpressed child asks for.
  // Whether anything downstream can report a press, so a recipe's `_press` is
  // only resolved where it can land: the browser's navigator path renders the
  // view directly and never presses, and a pointerless television mounts a
  // plain view rather than a Pressable.
  const canPress = WEB ? controlled || !scoped : !Platform.isTV || TV_HAS_POINTER;
  // Normalised once per distinct set, and NOT registered: these are coats over
  // whatever the recipe resolved, so they have to stay plain styles the render
  // forms can compose.
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

  // The recipe paints the control itself through its `root` slot, under the
  // caller's own `style` so a one-off override still wins.
  //
  // `root` is identity-stable per combination, so it is handed over AS IS when
  // there is no caller style - the common case.
  const root = recipe ? (rest.root as StyleProp<ViewStyle>) : undefined;
  const painted = usePair(root, style);
  // The press coat rides the `pressedStyle` channel, which is the only one that
  // can see a Pressable's own state. Skipped entirely where nothing can report a
  // press: the browser targets render the navigator's view directly, and a
  // pointerless television never mounts a Pressable at all.
  // Only what the press ADDS, not the whole root: the press coat lands after the
  // caller's `style`, so re-applying the resolved root there would revert a
  // one-off override (a `radius={12}` snapping back to the recipe's pill) for as
  // long as the finger is down.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `rest` already keys on every input `resolve` reads
  const pressDelta = useMemo(
    () => (recipe && canPress ? deltaOf(rest.root, resolve(true).root) : null),
    [recipe, canPress, rest],
  );
  const paintedPressed = pressDelta ?? pressedStyle;

  // Native renders the control as two views, so the half of the style that says
  // how the parent places this control has to ride on the outer one; the web
  // targets have a single view and keep the style whole.
  const layers = useMemo(() => (WEB ? null : splitBoxLayers(painted)), [painted]);

  // A disabled control is not a node at all, so the remote walks straight past
  // it rather than stopping on something that does nothing.
  if (disabled) {
    return (
      <Animated.View
        accessibilityRole={platformRole(role)}
        accessibilityState={a11yState ? { ...a11yState, disabled: true } : { disabled: true }}
        accessibilityLabel={label}
        aria-disabled
        style={[painted, focused ? focusedStyle : null, animated]}
      >
        {typeof children === 'function'
          ? children({ focused, pressed: false, hovered, slots: rest as ReturnType<R> })
          : children}
      </Animated.View>
    );
  }

  // Unscoped on a television is deliberately not handled here: an unscoped TV
  // screen is one the remote cannot reach, and registering with a navigator
  // that isn't there should throw at render.
  if (controlled || (!scoped && !Platform.isTV)) {
    return touchForm({
      boxRef: setBox,
      webKeys: webKeys?.pressable ?? null,
      label,
      role,
      a11yState,
      style: painted,
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
    });
  }

  // Built after the early returns: the paths above never touch the navigator
  // node, and constructing it first made the kit's most instantiated component
  // pay for a SpatialNavigationFocusableView it could not use.
  const node = navigatorForm({
    entry,
    webKeys: webKeys?.view ?? null,
    layers,
    style: painted,
    role,
    a11yState,
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
    pressedStyle: paintedPressed,
    hoveredStyle,
    onHoverIn: hoverIn,
    onHoverOut: hoverOut,
    onLongPress,
    hitSlop,
    resolve,
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
  role,
  a11yState,
  render,
}: Readonly<{
  painted: StyleProp<ViewStyle>[];
  pressedStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  hitSlop?: number | Insets;
  role: FocusRole;
  a11yState: A11yState;
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
      role={role}
      a11yState={a11yState}
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
  role = 'button',
  a11yState,
  webKeys,
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
  role?: FocusRole;
  a11yState: A11yState;
  webKeys?: WebKeys;
  boxRef?: Ref<View>;
  children: (pressed: boolean) => ReactNode;
}>) {
  const dip = usePressScale();
  return (
    <AnimatedPressable
      ref={boxRef}
      {...(unfocusable ? (UNFOCUSABLE as object) : (webKeys ?? null))}
      accessibilityRole={platformRole(role)}
      {...a11yState}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      hitSlop={hitSlop}
      onLayout={dip.onLayout}
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
