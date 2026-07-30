// What the grid and the row both had to work out, shared rather than agreed on
// twice: how far outside itself a virtualised list has to reach, and how many
// items it keeps beyond the ones on screen.
//
// Both were declared - with the same value and near-identical reasoning - in
// `virtual.tsx` and `virtual-rail.tsx`, which is how the two would eventually
// have drifted: a tile's focus treatment is one design decision, so the bleed
// that has to clear it is one number.

import { StyleSheet, type ViewStyle } from 'react-native';

// How far outside the list the clip box reaches. A tile grows when it takes
// focus (1.05, a 4px amber ring, a 28px drop shadow), and the box that clips
// the list's translation was clipping that too — shaving the top and bottom
// off every focused tile. The clip box is drawn this much bigger than the
// list in every direction and pulled back by the same amount, so it still
// clips the translation without clipping the focus treatment.
export const FOCUS_BLEED = 32;

// Two is the navigator library's default and the right trade here too:
// enough that a fast press doesn't outrun the window, few enough that the
// window stays small.
export const OVERSCAN = 2;

// The list translates its content, so something has to clip it or items above
// the resting position draw over whatever chrome sits there. Not the layout
// box: it's inset negatively by the focus bleed and padded back by the same
// amount, so the content area is exactly the list while the clip reaches
// `FOCUS_BLEED` past it. Absolute, so growing it costs the page no space.
export const clipStyles = StyleSheet.create({
  clip: {
    position: 'absolute',
    top: -FOCUS_BLEED,
    right: -FOCUS_BLEED,
    bottom: -FOCUS_BLEED,
    left: -FOCUS_BLEED,
    padding: FOCUS_BLEED,
    overflow: 'hidden',
  } satisfies ViewStyle,

  // The same box, but flush at the top — for a vertical list, which always has
  // chrome directly above it. The bleed is a hole in the clip, and upwards
  // that hole points straight at whatever the screen puts over the list (the
  // sort/genre filter strip on the browse screens), showing the scrolled-off
  // row through it. A vertical list gets its ring room from the top padding
  // of its content instead (see PosterGrid's `paddingTop`), since the list
  // parks the focused row at the content origin. Sideways and below, the
  // bleed is kept: nothing of the app's sits there.
  column: {
    position: 'absolute',
    top: 0,
    right: -FOCUS_BLEED,
    bottom: -FOCUS_BLEED,
    left: -FOCUS_BLEED,
    paddingRight: FOCUS_BLEED,
    paddingBottom: FOCUS_BLEED,
    paddingLeft: FOCUS_BLEED,
    overflow: 'hidden',
  } satisfies ViewStyle,
});
