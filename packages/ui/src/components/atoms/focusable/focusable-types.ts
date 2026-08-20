import type { ComponentRef, ReactNode, Ref } from 'react';
import type {
  AccessibilityRole,
  AccessibilityValue,
  Insets,
  LayoutChangeEvent,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import type { AnySv, StyleDecl, SvStateName } from '#ui/core';
import type { A11yProps } from '#ui/lib/a11y';

// `option` is not in React Native's union: react-native-web passes it through
// to the ARIA role a listbox row needs, but Android's accessibility delegate
// THROWS on it, so the native forms swap it for the nearest legal role and
// keep the selected state (see `platformRole`).
type FocusRole = AccessibilityRole | 'option';

/** What the control claims about itself, in whichever shape the platform reads
 *  (`#ui/lib/a11y`). */
type A11yState = A11yProps | undefined;

/** What `aria-current` a control claims; see `current` on FocusableProps. */
type FocusCurrent = 'page' | 'step';

/**
 * What a child render function is handed. `slots` is the recipe resolved
 * against the live interaction state, so a child spends finished values rather
 * than re-deriving them from `focused` / `pressed` / `hovered`.
 */
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
  /** The control's own measured box. Forwarded from the host element, so a
   *  component that positions something against the control (a thumb, a lens)
   *  measures the control itself rather than paying a wrapper per item. */
  onLayout?: (event: LayoutChangeEvent) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Controlled focus: the control leaves the navigator entirely and paints its
   *  focus states from this prop. */
  focused?: boolean;
  hitSlop?: number | Insets;
  /** A destination rather than an action: the control renders as an `<a href>`
   *  on the browser targets, so it is a real link to open in a tab, copy or
   *  download. Ignored on the native platforms, which have no document. */
  href?: string;
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
  /** Which one of a set is the one being shown: the page a pagination row is on,
   *  the step a wizard is at. Browser targets only, where it is `aria-current`;
   *  React Native has no equivalent, and no screen reader on those platforms
   *  reads one. Saying it here rather than on a wrapper is what keeps a paged row
   *  from being one element per page deeper than it needs to be. */
  current?: FocusCurrent;
  /** `role="switch" | "checkbox" | "radio"` state, announced as `aria-checked`. */
  checked?: boolean | 'mixed';
  /** `role="tab"`/listbox-option state, announced as `aria-selected`. */
  selected?: boolean;
  /** A disclosure trigger's open state, announced as `aria-expanded`. */
  expanded?: boolean;
  /** A toggle button's on state (a filter chip, "Ma liste"), announced as
   *  `aria-pressed`. Not `selected`: that is a choice among options, this is a
   *  control that is switched on. */
  pressed?: boolean;
  /** Working on what it was last asked to do, announced as `aria-busy`. Pair it
   *  with `inert`, which is the same fact said to the eye. */
  busy?: boolean;
  /** Where a `role="adjustable"` control sits in its range: a resize seam, a
   *  volume rail. Without it the control announces as a slider with no value. */
  value?: AccessibilityValue;
  ref?: Ref<ComponentRef<typeof View>>;
}

/** Resolves the recipe for one value of `pressed`, which is the only part of the
 *  state the outer render cannot see - a Pressable reports it from inside. */
type Resolve = (pressed: boolean) => ReturnType<AnySv>;

/** Tab reachability, plus whichever activation keys the form underneath does
 *  not already answer, on the web; null elsewhere. */
type WebKeys = {
  tabIndex: number;
  onKeyDown: (event: { nativeEvent: { key: string }; preventDefault: () => void }) => void;
} | null;

export type { A11yState, FocusableProps, FocusCurrent, FocusRole, FocusState, Resolve, WebKeys };
