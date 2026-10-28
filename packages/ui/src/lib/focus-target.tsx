import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { FocusCard, HAS_FOCUS_CARD } from './focus-card';
import { NATIVE_FOCUS, useNativeFocus } from './native-focus';

const OVERLAY = StyleSheet.absoluteFill;
const NO_PARALLAX = { enabled: false };
const PARALLAX = { enabled: true, shiftDistanceX: 2, shiftDistanceY: 2, tiltAngle: 0.05 };

/** Where a control's painted outline is: on a view inside it (`child`), or on the view itself (`host`). */
export type FocusFace = 'child' | 'host';

export interface FocusTarget {
  /** Spread on the control's own view: tvOS may focus it exactly while it is focused. Null where tvOS focus does not follow the app's, so the caller keeps its own. */
  hostProps: object | null;
  /** Rendered as the control's last child: the lift, tilt and light of the focus. */
  overlay: ReactNode;
  /** Whether the remote's Select reaches whoever owns this focus already, so the view must not answer it as a press of its own too. */
  remoteSelects: boolean;
}

/** The control's corner radius, read from its style. */
export function radiusOf(style: StyleProp<ViewStyle>): number {
  const radius = StyleSheet.flatten(style)?.borderRadius;
  return typeof radius === 'number' ? radius : 0;
}

/**
 * The one focus rule, for every control in the app however its focus is
 * decided (the navigator, or the player's own keys): the control shown as
 * focused is the view tvOS focuses, and on Apple TV it wears the focus card.
 * Everywhere else it changes nothing.
 */
export function useFocusTarget(focused: boolean, radius: number, face: FocusFace): FocusTarget {
  const native = useNativeFocus(focused);
  if (!NATIVE_FOCUS) return { hostProps: null, overlay: null, remoteSelects: false };
  return {
    hostProps: {
      focusable: native,
      isTVSelectable: native,
      hasTVPreferredFocus: native,
      tvParallaxProperties: HAS_FOCUS_CARD ? NO_PARALLAX : PARALLAX,
    },
    overlay: HAS_FOCUS_CARD ? (
      <FocusCard
        holdsFocus={native}
        radius={radius}
        face={face}
        style={OVERLAY}
        pointerEvents="none"
      />
    ) : null,
    remoteSelects: true,
  };
}
