// Splitting one control's style between the two views a native <Focusable> is.
//
// On the browser targets a control is a single element, so its style needs no
// splitting. On a television it is two: the navigator's own view, and the
// painted face inside it (the face is the one that scales, and a scale must not
// move the layout). The design authors ONE style for the control, and half of it
// belongs to each view:
//
//   - the BOX props say how the PARENT places the control - flex, size, margins,
//     absolute position. On the outer view, or the parent never sees them: a key
//     styled `flex: 1` whose outer view has no flex leaves that outer view
//     shrink-wrapping, and the face's `flex: 1` then resolves against a
//     zero-width box (this is exactly how the URL keyboard's keys collapsed into
//     slivers on Apple TV while rendering correctly on the web shells).
//   - everything else is the FACE: background, radius, padding, and how the
//     control arranges its own children.

import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';

/** The props that describe the control's box in its parent, not its face. */
const BOX_PROPS = new Set([
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'aspectRatio',
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

/** Makes the face fill the box it was split from. Growing (rather than `flex: 1`,
 * which would zero the basis) keeps a control that sizes itself from its content
 * sizing itself from its content: there is no free space to grow into. */
const FACE_FILL = { flexGrow: 1 } as const;

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
  for (const key of Object.keys(flat)) {
    if (BOX_PROPS.has(key)) {
      box[key] = flat[key];
      boxed = true;
    } else {
      face[key] = flat[key];
    }
  }
  if (!boxed) return { face: style };
  return { box: box as ViewStyle, face: [face as ViewStyle, FACE_FILL] };
}
