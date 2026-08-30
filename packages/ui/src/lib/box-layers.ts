// Splits one control's authored style between the two views a native
// <Focusable> renders: the navigator's own outer view, and the painted face
// inside it (the browser targets are a single element, so nothing to split
// there). BOX props - flex, size, margins, absolute position - must land on
// the outer view, since the parent never sees them otherwise and a self-sized
// face's `flex: 1` would resolve against a zero-width box. Everything else is
// the FACE: background, radius, padding, and the control's own children.

import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { styles } from '#ui/core';

/** The box props that can leave the box LARGER than the face inside it, and so
 * the only ones the face has to grow to fill. The rest place the box in its
 * parent or cap it; a face that grows for those fills whatever height the
 * parent happened to offer, which on a centred column is the whole screen. */
const SIZING_PROPS = new Set([
  'flex',
  'flexGrow',
  'flexBasis',
  'alignSelf',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'aspectRatio',
]);

/** The props that describe the control's box in its parent, not its face. */
const BOX_PROPS = new Set([
  ...SIZING_PROPS,
  'flexShrink',
  'maxWidth',
  'maxHeight',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'zIndex',
]);

const s = styles({
  /** Makes the face fill the box it was split from. Growing (rather than `flex: 1`,
   * which would zero the basis) keeps a control that sizes itself from its content
   * sizing itself from its content: there is no free space to grow into. */
  faceFill: { grow: 1 },
});

/**
 * One authored control style as the two views it has to drive on native.
 * `box` is undefined when the style is pure paint, which is the common case and
 * lets the caller leave the outer view unstyled.
 */
export function splitBoxLayers(style: StyleProp<ViewStyle>): {
  box?: ViewStyle;
  face: StyleProp<ViewStyle>;
} {
  const flat = StyleSheet.flatten(style) as Record<string, unknown> | undefined;
  if (!flat) return { face: style };
  const box: Record<string, unknown> = {};
  const face: Record<string, unknown> = {};
  let boxed = false;
  let sized = false;
  for (const key of Object.keys(flat)) {
    if (BOX_PROPS.has(key)) {
      box[key] = flat[key];
      boxed = true;
      sized ||= SIZING_PROPS.has(key);
    } else {
      face[key] = flat[key];
    }
  }
  if (!boxed) return { face: style };
  return {
    box: box as ViewStyle,
    face: sized ? [face as ViewStyle, s.faceFill] : (face as ViewStyle),
  };
}
