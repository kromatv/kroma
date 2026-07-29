// CSS features React Native supports under an `experimental_` prefix (native)
// but that react-native-web exposes under their plain CSS name. See css.web.ts.
//
// Keeping the prefix difference behind these three helpers is what lets every
// gradient in the app stay a single CSS string in a single source file, instead
// of a CSS value on the web and a <LinearGradient> component on native.

import type { ViewStyle } from 'react-native';

/** A CSS `background-image` value, e.g. `linear-gradient(158deg, #a 0%, #b 72%)`. */
export function gradient(css: string): ViewStyle {
  return { experimental_backgroundImage: css };
}

/** A CSS `background-position` value, e.g. `50% 28%`. */
export function bgPosition(value: string): ViewStyle {
  return { experimental_backgroundPosition: value };
}

/** A CSS `background-size` value, e.g. `cover`. */
export function bgSize(value: string): ViewStyle {
  return { experimental_backgroundSize: value };
}

/**
 * A CSS `mask-image` value - and a NO-OP here, which is the one place these
 * helpers do not paper over the difference.
 *
 * React Native has no mask at any prefix: masking a view means wrapping it in a
 * `<MaskedView>`, a second view tree rendered off-screen, which is a different
 * component rather than a different style. So a caller that wants a masked edge
 * gets it on the web and needs its own answer on native - see `virtual-rail.tsx`,
 * which falls back to painting the page colour over the row there.
 */
export function maskImage(_css: string): ViewStyle {
  return {};
}

/**
 * A CSS `backdrop-filter: blur(...)` - and a NO-OP here, like `maskImage`.
 *
 * React Native has no backdrop filter at any prefix: blurring what sits behind
 * a view means importing a platform blur view, a dependency the kit
 * deliberately stays free of (see nav-pill for the reasoning - old Tizen also
 * composites blur on the CPU and pays in frames). The browser targets get the
 * real thing, so a translucent card frosts the artwork behind it there and
 * keeps its plain wash on native.
 */
export function backdropBlur(_px: number): ViewStyle {
  return {};
}

/**
 * A CSS `field-sizing: content` - a text control that sizes itself to whatever
 * is typed into it - and a NO-OP here, like `maskImage`.
 *
 * React Native has no such property: a native entry that grows is one that
 * measures its own content and sets its height, which <TextArea> does through
 * `onContentSizeChange`. The browser targets hand the same job to the engine,
 * where it costs no re-render (and, on a browser too old to know the property,
 * degrades to a field that scrolls at the height `rows` asked for).
 */
export function fieldSizing(): ViewStyle {
  return {};
}

/**
 * Promote a view to its own compositing layer.
 *
 * A no-op on native, where the OS compositor already decides layers and RN has
 * no `will-change`; the web half turns it into `translateZ(0)` + `will-change`.
 * Use it sparingly and only where measured: a promoted layer costs GPU memory,
 * and the win is specifically for a view that would otherwise be re-rasterized
 * by an animation happening near it (a full-screen gradient above a fading
 * backdrop - see AmbientBackdrop).
 */
export function promote(): ViewStyle {
  return {};
}
