// The visual vocabulary <TextField> and <TextArea> share.
//
// The two atoms are required to be pixel-matched — a form puts them side by
// side, and a one-line TextArea has to be exactly a TextField tall — so the edge
// rule, the placeholder wash and the content line are one declaration rather
// than two that happen to agree today. They were copied, comments included, and
// a token change would have had to be made in both places to stay true.

import type { TextStyle } from 'react-native';
import { colors } from '#ui/lib/tokens';

/** The field's edge. Focus wins over invalid: while you are fixing the value,
 * the field should look like the thing you are working in, not like a failure. */
export function edgeColor(focused: boolean, invalid: boolean): string {
  if (focused) return colors.accent;
  return invalid ? colors.danger : colors.borderStrong;
}

export const PLACEHOLDER = 'rgba(244, 243, 240, 0.3)';

/** The height of a field's content row, independent of what sits in it: the
 * entry never measures shorter than this and the glyph wells never measure
 * taller, so every field in a form lines up regardless of icons. A caller who
 * sets a bigger `textStyle` font still grows the field, which is intended -
 * what must not vary is a field's height against its own neighbours.
 *
 * It is also the unit <TextArea>'s `rows` and `maxRows` count in, which is what
 * makes a one-line TextArea and a TextField the same height. */
export const CONTENT_LINE = 24;

/** Web only, and `none` rather than width 0: Chrome's own focus ring is
 * `outline-style: auto`, which ignores the width - the field kept its blue
 * browser ring inside the kit's amber one until the STYLE was cleared. React
 * Native's types don't know `none` (native has no outline at all), hence the
 * cast. */
export const NO_OUTLINE = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;
