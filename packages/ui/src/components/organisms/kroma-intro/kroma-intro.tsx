// <KromaIntro>, native (Apple TV, Android TV, phones): not this one.
//
// The brand film is a DOM component - a real <video> element, `document`
// visibility handling, and a pure-CSS fallback scene - because that is what the
// browser targets need and what plays a 4K60 HEVC file without a native module.
// None of it can run under React Native, so this side of the split renders
// nothing and says why.
//
// The native clients are not missing the intro: they play the same film through
// `expo-video` in their own shell (see packages/tv/src/app/BrandIntro.tsx, whose
// `.web` sibling is what reaches for the component below). This file exists so
// that importing the kit from Metro resolves, rather than dragging a <video> tag
// into a bundle that has no DOM to put it in.

import type { KromaIntroProps } from './kroma-intro.web';

export type { KromaIntroProps };

export function KromaIntro(_props: Readonly<KromaIntroProps>) {
  return null;
}
