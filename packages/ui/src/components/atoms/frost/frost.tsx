// <Frost>: the backdrop-blur layer of a glass surface.
//
// Glass in the kit was a translucent wash, and the one thing a wash cannot do
// is FROST - blur what sits behind it. Two hard facts stand in the way: React
// Native has no backdrop filter at any prefix, and the kit stays free of
// platform blur dependencies (see nav-pill). This layer keeps both true and
// frosts anyway:
//
// - The browser targets get the real CSS `backdrop-filter` (see css.web.ts).
//   The 2019 TV WebKits ignore the property outright, so the legacy Tizen and
//   webOS tiers keep the plain wash at zero cost instead of compositing a blur
//   on the CPU.
// - Native renders whatever blur view the APP registered at startup -
//   `registerFrost(BlurView)` from expo-blur in the TV shell - the same
//   inversion as the voice-search and launcher backends: the dependency lives
//   in the shell, the kit holds a slot for it. A shell that registers nothing
//   keeps the wash, which is also the right answer wherever the platform blur
//   is not worth its frames.
//
// The layer is a FIRST CHILD of the surface it frosts, absolutely filled, so
// the surface's own tint paints over it and the content over both. It clips
// itself to the surface's corner radius rather than asking the surface for
// `overflow: hidden`, which would also clip the focus rings of the controls
// living on it.

import type { ComponentType } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';
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
 * module scope, before the first render - like every other shell backend.
 * Generic over the component's own props: `ComponentType` is invariant in P
 * (its `propTypes` member sees to that), so naming the props directly would
 * reject expo-blur's <BlurView> over tints the kit never passes. */
function registerFrost<P extends FrostBackdropProps>(component: ComponentType<P>): void {
  PlatformFrost = component as ComponentType<FrostBackdropProps>;
}

interface FrostProps {
  /** Blur strength in CSS px; the platform intensity is derived from it. */
  amount?: number;
  /** Corner radius of the surface this layer sits in (it clips itself). */
  radius?: number;
  tint?: 'light' | 'dark' | 'default';
}

function Frost({ amount = 12, radius = 0, tint = 'dark' }: Readonly<FrostProps>) {
  const shape = radius > 0 ? { borderRadius: radius } : null;
  if (WEB) {
    // backdrop-filter clips to its own element's rounded border box, so the
    // radius alone bounds the frost; `overflow` stays untouched.
    return <View style={[FILL, shape, backdropBlur(amount)]} />;
  }
  if (!PlatformFrost) return null;
  return (
    <PlatformFrost
      // expo-blur's 0-100 scale: about four steps to the CSS pixel.
      intensity={Math.min(100, amount * 4)}
      tint={tint}
      style={[FILL, CLIP, shape]}
    />
  );
}

const FILL = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  // Never a touch target: the surface underneath owns the press.
  pointerEvents: 'none',
  // BELOW the surface's content. On the web a positioned element paints over
  // its static siblings whatever the document order, so without this the blur
  // sat on top of the very glyphs and labels it shares a card with and smeared
  // them out (an icon-sized stroke vanishes entirely under blur(12px)).
  zIndex: -1,
} as const;
const CLIP = { overflow: 'hidden' } as const;

export type { FrostBackdropProps, FrostProps };
export { Frost, registerFrost };
