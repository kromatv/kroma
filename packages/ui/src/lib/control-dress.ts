import type { StyleProp, ViewStyle } from 'react-native';
import type { StyleScope } from '#ui/core/style-scope';
import { splitBoxLayers } from './box-layers';
import { ARROW, COLOUR_MOTION, HAND } from './cursor';
import { NO_OUTLINE } from './field-shell';
import { WEB } from './platform';

function pointerCursor(disabled: boolean, actionable: boolean): ViewStyle | null {
  if (!WEB) return null;
  if (disabled) return ARROW;
  return actionable ? HAND : null;
}

/** A control's rest style with the browser's colour motion, cursor and outline reset under it; unchanged on native. */
export function dressControl(
  painted: StyleProp<ViewStyle>,
  disabled: boolean,
  actionable: boolean,
): StyleProp<ViewStyle> {
  return WEB ? [COLOUR_MOTION, pointerCursor(disabled, actionable), NO_OUTLINE, painted] : painted;
}

/** The control's style split into its outer box and painted face where it renders as two views; null where it is one. */
export function controlLayers(
  painted: StyleProp<ViewStyle>,
  scope: StyleScope,
): ReturnType<typeof splitBoxLayers> | null {
  return WEB ? null : splitBoxLayers(painted, scope);
}
