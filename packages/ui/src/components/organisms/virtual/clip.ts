// What the grid and the row both had to work out, shared rather than agreed on
// twice: how far outside itself a virtualised list has to reach, and how many
// items it keeps beyond the ones on screen.
//
// Both were declared - with the same value and near-identical reasoning - in
// `virtual.tsx` and `virtual-rail.tsx`, which is how the two would eventually
// have drifted: a tile's focus treatment is one design decision, so the bleed
// that has to clear it is one number.

import { StyleSheet, type ViewStyle } from 'react-native';

/**
 * How far outside the list the clip box reaches.
 *
 * A tile grows when it takes focus - 1.05, a 4px amber ring and a 28px drop
 * shadow - and the box that has to clip the list's translation was clipping that
 * too: the top and bottom of every focused tile were shaved off, and the FIRST
 * tile lost its left edge, because at rest it sits exactly on the boundary. The
 * clip box is therefore drawn this much bigger than the list in every direction
 * and pulled back by the same amount, so it still clips the translation - which
 * is the whole reason it exists - without clipping the focus treatment.
 */
export const FOCUS_BLEED = 32;

/** How many rows / items are kept beyond the ones on screen. Two is the
 * navigator library's default and the right trade here too: enough that a fast
 * press does not outrun the window, few enough that the window stays small. */
export const OVERSCAN = 2;

/**
 * The clip box.
 *
 * The list translates its content, so something has to clip it or the items
 * above the resting position are drawn over whatever chrome sits there.
 *
 * It is not the layout box: it is inset NEGATIVELY by the focus bleed and padded
 * back by the same amount, so the content area is exactly the list (which
 * measures it, and whose item maths depends on that) while the clip reaches
 * `FOCUS_BLEED` past it. Absolute, so growing it costs the page no space.
 */
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

  /**
   * The same box, but FLUSH AT THE TOP - for a vertical list, which always has
   * chrome directly above it.
   *
   * The bleed is a hole in the clip, and upwards that hole points straight at
   * whatever the screen puts over the list. On the browse screens that is the
   * sort/genre filter strip, and the 32px showing through it is the bottom of
   * the row scrolled off the top - title bar and all - painted across the chips.
   * Raising the strip's `zIndex` does not fix it either: the chips are opaque
   * but the strip is not, so the bleed simply shows between them.
   *
   * A vertical list gets its ring room from the TOP PADDING of its content
   * instead (see PosterGrid's `paddingTop`): the list parks the focused row at
   * the content origin, so padding there is room inside the clip rather than a
   * hole through it. Sideways and below, the bleed is kept - nothing of the
   * app's sits there, and a focused tile in the first or last column still needs
   * its ring.
   */
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
