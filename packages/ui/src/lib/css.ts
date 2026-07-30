// CSS features React Native supports under an `experimental_` prefix (native)
// but that react-native-web exposes under their plain CSS name. See css.web.ts.

import type { ViewStyle } from 'react-native';

export function gradient(css: string): ViewStyle {
  return { experimental_backgroundImage: css };
}

export function bgPosition(value: string): ViewStyle {
  return { experimental_backgroundPosition: value };
}

export function bgSize(value: string): ViewStyle {
  return { experimental_backgroundSize: value };
}

/** A CSS `mask-image` value, and a NO-OP on native: React Native has no mask at
 * any prefix, so a caller that wants a masked edge needs its own answer there
 * (see `virtual-rail.tsx`, which paints the page colour over the row instead). */
export function maskImage(_css: string): ViewStyle {
  return {};
}

/** A CSS `backdrop-filter: blur(...)`, and a NO-OP on native: React Native has
 * no backdrop filter at any prefix, and a platform blur view is a dependency the
 * kit stays free of (old Tizen also composites blur on the CPU). */
export function backdropBlur(_px: number): ViewStyle {
  return {};
}

/** A CSS `field-sizing: content`, and a NO-OP on native: React Native has no
 * such property, so <TextArea> measures itself through `onContentSizeChange`. */
export function fieldSizing(): ViewStyle {
  return {};
}

/** Promote a view to its own compositing layer; a no-op on native, where the OS
 * compositor already decides layers. Use it only where measured - a promoted
 * layer costs GPU memory. */
export function promote(): ViewStyle {
  return {};
}
