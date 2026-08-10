// Web half of css.ts: react-native-web passes these straight through to CSS
// under their standard names, with no `experimental_` prefix.

import type { ViewStyle } from 'react-native';

// Baked by the TV shells' Vite `define` (see @kroma/bundler's tvShellConfig).
// Absent in the browser client, which is what the property read - rather than a
// bare global - is for.
const TV = (globalThis as { __KROMA_TV_TIER__?: boolean }).__KROMA_TV_TIER__ === true;

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
  // Not on a television, at any strength.
  //
  // A backdrop-filter is not paid once: it re-blurs whenever anything BEHIND it
  // changes, and a TV composites that on the CPU. The sign-in gate drifts a
  // full-screen still behind every frosted control on screen - the keyboard,
  // the buttons, the list rows - so each one re-blurred on every frame of the
  // drift. A 2024 Samsung panel measured 40fps with the blur and 60 without it,
  // for an effect nobody is looking at from the sofa.
  //
  // The sets lose nothing they had: the 2019 TV WebKits ignore the property
  // outright, so the plain wash is already the fallback this tier ships.
  if (TV) return {};
  return {
    backdropFilter: `blur(${px}px)`,
    WebkitBackdropFilter: `blur(${px}px)`,
  } as unknown as ViewStyle;
}
