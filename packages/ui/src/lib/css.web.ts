// Web half of css.ts: react-native-web passes these straight through to CSS
// under their standard names, with no `experimental_` prefix.

import type { ViewStyle } from 'react-native';

export function gradient(css: string): ViewStyle {
  return { backgroundImage: css } as ViewStyle;
}

export function bgPosition(value: string): ViewStyle {
  return { backgroundPosition: value } as ViewStyle;
}

export function bgSize(value: string): ViewStyle {
  return { backgroundSize: value } as ViewStyle;
}

/** A CSS `mask-image` value, e.g. `linear-gradient(to right, transparent, #000 32px)`.
 *  react-native-web writes it out with the `-webkit-` / `-moz-` / `-ms-` prefixes
 *  as well, which is what makes it land on the 2019 WebKits the TV shells run. */
export function maskImage(css: string): ViewStyle {
  return { maskImage: css } as ViewStyle;
}

/** A CSS `field-sizing: content`: the engine sizes the entry to its content, so
 *  a growing textarea costs neither a measure nor a re-render. Chromium has it;
 *  an older TV WebKit simply ignores it and the field keeps the height `rows`
 *  gave it. See css.ts for the native half. */
export function fieldSizing(): ViewStyle {
  return { fieldSizing: 'content' } as unknown as ViewStyle;
}

/** Give this view its own GPU layer, so an animation near it does not force it
 * to re-rasterize. `translateZ(0)` is the portable "own texture"; `willChange`
 * keeps the layer alive between animations instead of paying to rebuild it. See
 * css.ts for when this is worth it (and when it is not). */
export function promote(): ViewStyle {
  return { transform: 'translateZ(0)', willChange: 'transform' } as unknown as ViewStyle;
}

/** A CSS `backdrop-filter: blur(Npx)`, with the `-webkit-` spelling alongside
 * for the older TV WebKits. See css.ts for why native gets nothing. */
export function backdropBlur(px: number): ViewStyle {
  return {
    backdropFilter: `blur(${px}px)`,
    WebkitBackdropFilter: `blur(${px}px)`,
  } as unknown as ViewStyle;
}
