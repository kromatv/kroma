// The brand film is a DOM component (a real <video> element, `document`
// visibility handling, a pure-CSS fallback), none of which runs under React
// Native — so on native this side of the split renders nothing.
//
// Native clients aren't missing the intro: they play the same film through
// `expo-video` in their own shell (see packages/tv/src/app/BrandIntro.tsx).
// This file exists so importing the kit from Metro resolves, rather than
// dragging a <video> tag into a bundle with no DOM to put it in.

import type { KromaIntroProps } from './kroma-intro.web';

export type { KromaIntroProps };

export function KromaIntro(_props: Readonly<KromaIntroProps>) {
  return null;
}
