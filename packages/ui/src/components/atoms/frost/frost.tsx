// <Frost>: the backdrop-blur layer of a glass surface. React Native has no
// backdrop filter, and the kit stays free of platform blur dependencies (see
// nav-pill), so this layer keeps both true and frosts anyway:
//
// - Browser targets get the real CSS `backdrop-filter` (see css.web.ts). The
//   2019 TV WebKits ignore the property outright, so legacy Tizen and webOS
//   keep the plain wash at zero cost instead of compositing a blur on the CPU.
// - Native renders whatever blur view the app registered at startup
//   (`registerFrost(BlurView)` from expo-blur in the TV shell) — the same
//   inversion as the voice-search and launcher backends. A shell that
//   registers nothing keeps the wash.
//
// The layer is a first child of the surface it frosts, absolutely filled, and
// clips itself to the surface's corner radius rather than asking the surface
// for `overflow: hidden`, which would also clip its controls' focus rings.

import type { ComponentType } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';
import { type CornerValue, onPaper, radiusValue, styles } from '#ui/core';
import { backdropBlur } from '#ui/lib/css';

const WEB = Platform.OS === 'web';

/** What a registered platform blur must accept - expo-blur's <BlurView> as it
 * stands, so a shell registers the component itself, unconfigured. */
interface FrostBackdropProps {
  /** Platform blur strength, 0-100 (expo-blur's scale). */
  intensity?: number;
  /** Open string union: expo-blur's tint set is wider than the three the kit
   *  asks for, and the registered component must remain assignable. */
  tint?: 'light' | 'dark' | 'default' | (string & {});
  style?: StyleProp<ViewStyle>;
}

let PlatformFrost: ComponentType<FrostBackdropProps> | null = null;

/** Hand the kit the platform's blur view (the TV shell's expo-blur), once, at
 * module scope, before the first render. Generic over the component's own
 * props, since `ComponentType` is invariant in `P` and naming the props
 * directly would reject <BlurView> over tints the kit never passes. */
function registerFrost<P extends FrostBackdropProps>(component: ComponentType<P>): void {
  PlatformFrost = component as ComponentType<FrostBackdropProps>;
}

interface FrostProps {
  /** Blur strength in CSS px; the platform intensity is derived from it. */
  amount?: number;
  /** Corner of the surface this layer sits in (it clips itself), by token name
   *  or in px. */
  radius?: CornerValue;
  /** Defaults to the ground the app is on. Pass it only for a surface that holds
   *  one ground whatever the app chose, the way the player's chrome stays dark. */
  tint?: 'light' | 'dark' | 'default';
}

function Frost({ amount = 12, radius = 0, tint }: Readonly<FrostProps>) {
  const corner = radiusValue(radius);
  const shape = corner > 0 ? { borderRadius: corner } : null;
  if (WEB) {
    // backdrop-filter clips to its own element's rounded border box, so the
    // radius alone bounds the frost; `overflow` stays untouched.
    return <View style={[s.fill, shape, backdropBlur(amount)]} />;
  }
  if (!PlatformFrost) return null;
  return (
    <PlatformFrost
      // expo-blur's 0-100 scale: about four steps to the CSS pixel.
      intensity={Math.min(100, amount * 4)}
      tint={tint ?? (onPaper() ? 'light' : 'dark')}
      style={[s.fill, s.clip, shape]}
    />
  );
}

const s = styles({
  fill: {
    fill: true,
    // Never a touch target: the surface underneath owns the press.
    pointerEvents: 'none',
    // Below the surface's content: a positioned element on the web paints over
    // its static siblings regardless of document order.
    z: -1,
  },
  clip: { overflow: 'hidden' },
});

export type { FrostBackdropProps, FrostProps };
export { Frost, registerFrost };
